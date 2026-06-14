import secrets
import string
from fastapi import APIRouter, Depends, HTTPException, status

from security import hash_password, verify_password, create_access_token, get_current_user
from repositories import user_repo, paper_repo
from models.user import User, Notification
from schemas.user import UserSignupRequest, AuthResponse, LoginRequest, ProfileResponse, UnlockAnswerResponse

router = APIRouter(prefix="/api", tags=["Users"])

def generate_referral_code(length: int = 8) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))

@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def signup(payload: UserSignupRequest):
    existing_user = await user_repo.get_user_by_email(payload.email)
    if existing_user:
        raise HTTPException(status_code=409, detail="User with this email already exists")

    starting_credit = 100
    if payload.referral_code:
        referrer = await user_repo.get_user_by_referral_code(payload.referral_code)
        if not referrer:
            raise HTTPException(status_code=400, detail="Invalid referral code")
        starting_credit = 300
        await user_repo.update_credits(referrer.id, 200)
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
    return AuthResponse(userId=user_id, token=token, credit=new_user.credit, ref_code=new_user.ref_code)

@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest):
    user = await user_repo.get_user_by_email(payload.email)
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(user.id)
    return AuthResponse(userId=user.id, token=token, credit=user.credit, ref_code=user.ref_code)

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
async def unlock_answer(
    question_id: str, 
    current_user: User = Depends(get_current_user)
):
    if current_user.credit < 5:
        raise HTTPException(status_code=402, detail="Insufficient credits")

    success = await user_repo.unlock_answer(current_user.id, question_id)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to unlock answer")

    return UnlockAnswerResponse(
        message="Answer unlocked successfully", 
        credit=current_user.credit - 5
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