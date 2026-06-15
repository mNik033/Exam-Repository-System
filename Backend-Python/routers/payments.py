import hmac
import hashlib
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from config import settings
from security import get_current_user
from models.user import User
from repositories import user_repo

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

@router.get("/plans")
async def get_plans():
    return [
        {"amount": amount, "credits": credits}
        for amount, credits in CREDIT_MAP.items()
    ]

@router.post("/makePayment")
async def make_payment(payload: MakePaymentRequest,current_user: User = Depends(get_current_user)):
    if payload.amount not in CREDIT_MAP:
        raise HTTPException(status_code=400, detail="Invalid payment amount")

    auth = (settings.RAZORPAY_KEY, settings.RAZORPAY_SECRET)
    data = {
        "amount": payload.amount,
        "currency": payload.currency,
        "receipt": payload.receipt
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(f"{RAZORPAY_BASE_URL}/orders", json=data, auth=auth)
            if response.status_code != 200:
                raise HTTPException(
                    status_code=400,
                    detail=f"Razorpay order creation failed: {response.text}"
                )
            return response.json()
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Error communicating with Razorpay: {str(e)}"
            )

@router.post("/validatePayment")
async def validate_payment(
    payload: ValidatePaymentRequest,
    current_user: User = Depends(get_current_user)
):
    msg = f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}".encode("utf-8")
    secret = settings.RAZORPAY_SECRET.encode("utf-8")

    generated_signature = hmac.new(key=secret, msg=msg, digestmod=hashlib.sha256).hexdigest()

    if not hmac.compare_digest(generated_signature, payload.razorpay_signature):
        raise HTTPException(status_code=400, detail="Transaction verification failed")

    # fetch verified amount from Razorpay
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{RAZORPAY_BASE_URL}/orders/{payload.razorpay_order_id}",
            auth=(settings.RAZORPAY_KEY, settings.RAZORPAY_SECRET)
        )
        if response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to verify order with Razorpay")
        verified_amount = response.json()["amount"]

    credits_to_add = CREDIT_MAP.get(verified_amount)
    if credits_to_add is None:
        raise HTTPException(status_code=400, detail="Invalid payment amount")

    await user_repo.update_credits(current_user.id, credits_to_add)
    return {"credit": current_user.credit + credits_to_add}
