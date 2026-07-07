from pydantic import BaseModel, Field, AfterValidator
from typing import Annotated

def validate_bcrypt_length(v: str) -> str:
    if len(v.encode("utf-8")) > 72:
        raise ValueError("Password must not exceed 72 bytes")
    return v

BcryptPassword = Annotated[str, AfterValidator(validate_bcrypt_length)]

class SendOTPRequest(BaseModel):
    email: str

class UserSignupRequest(BaseModel):
    name: str
    email: str
    password: BcryptPassword
    referral_code: str | None = None
    otp_code: str
    enrolled_courses: list[str] = []

class LoginRequest(BaseModel):
    email: str
    password: BcryptPassword

class AuthResponse(BaseModel):
    userId: str
    token: str
    credit: int
    ref_code: str
    name: str
    email: str

class ProfileResponse(BaseModel):
    name: str
    email: str
    credit: int
    ref_code: str

class UnlockAnswerResponse(BaseModel):
    message: str
    credit: int