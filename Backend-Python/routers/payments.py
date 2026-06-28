import hmac
import hashlib
import httpx
import logging
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from config import settings
from security import get_current_user, guard
from models.user import User
from repositories import user_repo, payment_repo

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Payments"])

RAZORPAY_BASE_URL = "https://api.razorpay.com/v1"

CREDIT_MAP = {
    2900: 100,
    7900: 300,
    14900: 750,
}

class MakePaymentRequest(BaseModel):
    amount: int
    currency: str
    receipt: str

class ValidatePaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str

def _verify_razorpay_signature(msg: bytes, signature: str, secret: str) -> bool:
    generated = hmac.new(key=secret.encode("utf-8"), msg=msg, digestmod=hashlib.sha256).hexdigest()
    return hmac.compare_digest(generated, signature)

@router.get("/plans")
async def get_plans():
    return [
        {"amount": amount, "credits": credits}
        for amount, credits in CREDIT_MAP.items()
    ]

@router.post("/makePayment")
@guard.rate_limit(requests=10, window=60)
async def make_payment(payload: MakePaymentRequest,current_user: User = Depends(get_current_user)):
    if payload.amount not in CREDIT_MAP:
        raise HTTPException(status_code=400, detail="Invalid payment amount")

    auth = (settings.RAZORPAY_KEY, settings.RAZORPAY_SECRET)
    data = {
        "amount": payload.amount,
        "currency": payload.currency,
        "receipt": payload.receipt,
        "notes": {
            "user_id": current_user.id
        }
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(f"{RAZORPAY_BASE_URL}/orders", json=data, auth=auth)
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=500,
                detail=f"Error communicating with Razorpay: {str(e)}"
            )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=400,
                detail=f"Razorpay order creation failed: {response.text}"
            )
        
        return response.json()

@router.post("/validatePayment")
@guard.rate_limit(requests=10, window=60)
async def validate_payment(
    payload: ValidatePaymentRequest,
    current_user: User = Depends(get_current_user)
):
    msg = f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}".encode("utf-8")
    secret = settings.RAZORPAY_SECRET

    if not _verify_razorpay_signature(msg, payload.razorpay_signature, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # fetch verified amount from Razorpay
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{RAZORPAY_BASE_URL}/orders/{payload.razorpay_order_id}",
                auth=(settings.RAZORPAY_KEY, settings.RAZORPAY_SECRET)
            )
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=503,
                detail=f"Error communicating with Razorpay: {str(e)}"
            )
        
        if response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to verify order with Razorpay")
        verified_amount = response.json()["amount"]
    
    is_new = await payment_repo.mark_payment_processed(payload.razorpay_payment_id)
    if not is_new:
        # the webhook already processed the payment
        new_user = await user_repo.get_by_id(current_user.id)
        return {"credit": new_user.credit} 

    credits_to_add = CREDIT_MAP.get(verified_amount)
    if credits_to_add is None:
        raise HTTPException(status_code=400, detail="Invalid payment amount")

    new_credit = await user_repo.update_credits(current_user.id, credits_to_add)
    return {"credit": new_credit}

@router.post("/webhook")
@guard.bypass(checks=["rate_limit"])
async def razorpay_webhook(request: Request):
    signature = request.headers.get("X-Razorpay-Signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing signature")

    raw_body = await request.body()

    secret = settings.RAZORPAY_WEBHOOK_SECRET

    if not _verify_razorpay_signature(raw_body, signature, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    payload_dict = await request.json()

    event_name = payload_dict.get("event")
    if event_name in ["payment.captured", "order.paid"]:
        try:
            payment_entity = payload_dict["payload"]["payment"]["entity"]
            notes = payment_entity.get("notes") or {}
            user_id = notes.get("user_id")

            if not user_id:
                return {"status": "error", "message": "No user_id found in notes"}

            payment_id = payment_entity["id"]
            amount = payment_entity["amount"]

            is_new = await payment_repo.mark_payment_processed(payment_id)
            if not is_new:
                return {"status": "already processed"}

            credits_to_add = CREDIT_MAP.get(amount)
            if credits_to_add:
                await user_repo.update_credits(user_id, credits_to_add)
            else:
                logger.error(f"CRITICAL: Unknown amount received from webhook: {amount}")
            
            return {"status": "success"}
        except Exception as e:
            logger.error(f"CRITICAL: Error in webhook: {str(e)}")
            return {"status": "error", "message": "Failed to process webhook"}

    return {"status": "ignored"}