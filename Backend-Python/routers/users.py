import json
import secrets
import string
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from database import otps, redis_client
from security import hash_password, verify_password, create_access_token, get_current_user, guard, get_user_from_token_query
from repositories import user_repo, paper_repo, question_repo
from models.user import User, Notification
from schemas.user import UserSignupRequest, AuthResponse, LoginRequest, ProfileResponse, UnlockAnswerResponse, SendOTPRequest
from services.email import send_otp_email
from services.metrics import (
    credits_awarded_total, user_referrals_total, 
    credits_spent_total, answers_unlocked_total
)
from config import settings

router = APIRouter(prefix="/api", tags=["Users"])

def generate_referral_code(length: int = 8) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))

@router.post("/send-otp")
@guard.rate_limit(requests=2, window=60)
async def send_otp(payload: SendOTPRequest):
    if settings.INSTITUTE_DOMAIN:
        expected_domain = settings.INSTITUTE_DOMAIN.lower()
        actual_domain = payload.email.split("@")[-1].lower()
        if actual_domain != expected_domain:
            raise HTTPException(
                400, 
                f"Please sign up using your institute email (@{expected_domain})"
            )

    existing_user = await user_repo.get_user_by_email(payload.email)
    if existing_user:
        raise HTTPException(400, "Email is already registered")

    otp_code = "".join(secrets.choice(string.digits) for _ in range(6))

    await otps.update_one(
        {"email": payload.email},
        {"$set": {
            "code": otp_code,
            "created_at": datetime.now(timezone.utc)
        }},
        upsert=True
    )

    await send_otp_email(payload.email, otp_code)
    
    return {"message": "OTP sent successfully"}

@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
@guard.rate_limit(requests=5, window=60)
async def signup(payload: UserSignupRequest):
    existing_user = await user_repo.get_user_by_email(payload.email)
    if existing_user:
        raise HTTPException(status_code=409, detail="User with this email already exists")

    valid_otp = await otps.find_one({
        "email": payload.email,
        "code": payload.otp_code
    })

    if not valid_otp:
        raise HTTPException(400, "Invalid or expired OTP")

    starting_credit = 100
    if payload.referral_code:
        referrer = await user_repo.get_user_by_referral_code(payload.referral_code)
        if not referrer:
            raise HTTPException(status_code=400, detail="Invalid referral code")
        starting_credit = 300
        await user_repo.update_credits(referrer.id, 200)
        credits_awarded_total.labels(reason="referral").inc(200)
        await user_repo.add_notification(
            user_id=referrer.id,
            message="Someone signed up using your referral code! You have been credited 200 credits.",
            type="referral"
        )

    new_user = User(
        name=payload.name, 
        email=payload.email, 
        password_hash=hash_password(payload.password), 
        credit=starting_credit, 
        ref_code=generate_referral_code(),
        enrolled_courses=payload.enrolled_courses
    )

    user_id = await user_repo.create_user(new_user)
    token = create_access_token(user_id)
    await otps.delete_one({"email": payload.email})
    credits_awarded_total.labels(reason="signup").inc(starting_credit)
    return AuthResponse(
        userId=user_id, 
        token=token, 
        credit=new_user.credit, 
        ref_code=new_user.ref_code,
        name=new_user.name,
        email=new_user.email
    )

@router.post("/login", response_model=AuthResponse)
@guard.rate_limit(requests=5, window=60)
async def login(payload: LoginRequest):
    user = await user_repo.get_user_by_email(payload.email)
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(user.id)
    return AuthResponse(
        userId=user.id, 
        token=token, 
        credit=user.credit, 
        ref_code=user.ref_code,
        name=user.name,
        email=user.email
    )

@router.get("/profile", response_model=ProfileResponse)
async def get_profile(current_user: User = Depends(get_current_user)):
    # FastAPI will automatically reject requests without a valid
    # JWT token because of Depends(get_current_user)
    return ProfileResponse(
        name=current_user.name, 
        email=current_user.email, 
        credit=current_user.credit, 
        ref_code=current_user.ref_code
    )

@router.get("/notifications", response_model=list[Notification])
async def get_notifications(current_user: User = Depends(get_current_user)):
    notifications = await user_repo.get_notifications(current_user.id)
    await user_repo.mark_notifications_read(current_user.id)
    return notifications

@router.post("/unlockAnswer", response_model=UnlockAnswerResponse)
@guard.rate_limit(requests=20, window=60)
async def unlock_answer(
    question_id: str, 
    current_user: User = Depends(get_current_user)
):
    if current_user.credit < settings.UNLOCK_COST:
        raise HTTPException(status_code=402, detail="Insufficient credits")

    question = await question_repo.get_question_by_id(question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    new_credit = await user_repo.unlock_answer(current_user.id, question_id, settings.UNLOCK_COST)
    if new_credit is None:
        raise HTTPException(status_code=400, detail="Failed to unlock answer")

    credits_spent_total.labels(action="unlock_answer").inc(settings.UNLOCK_COST)
    answers_unlocked_total.inc()

    return UnlockAnswerResponse(
        message="Answer unlocked successfully", 
        credit=new_credit,
        answer_text=question.answer_text
    )

@router.get("/getUnlockedAnswers")
async def get_unlocked_answers(
    paper_id: str, 
    current_user: User = Depends(get_current_user)
):
    question_ids = await paper_repo.get_question_ids(paper_id)
    if question_ids is None:
        raise HTTPException(status_code=404, detail="Paper not found")
    
    unlocked_set = set(current_user.unlocked_answers)
    unlocked_for_paper = [qid for qid in question_ids if qid in unlocked_set]
    return {"unlocked_answers": unlocked_for_paper}

@router.get("/notifications/stream")
async def stream_notifications(current_user: User = Depends(get_user_from_token_query)):
    # SSE endpoint for real-time notifications
    async def event_generator():
        pubsub = redis_client.pubsub()
        await pubsub.subscribe(f"{settings.REDIS_PREFIX}notifications:{current_user.id}")

        try:
            yield ": keepalive\n\n"

            async for message in pubsub.listen():
                if message["type"] == "message":
                    yield f"data: {message['data']}\n\n"
        finally:
            await pubsub.unsubscribe()
            await pubsub.close()

    return StreamingResponse(
        event_generator(), 
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )