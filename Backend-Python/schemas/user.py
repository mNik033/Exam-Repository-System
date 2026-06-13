from pydantic import BaseModel, Field, AfterValidator
from typing import Annotated

def validate_bcrypt_length(v: str) -> str:
    if len(v.encode("utf-8")) > 72:
        raise ValueError("Password must not exceed 72 bytes")
    return v

BcryptPassword = Annotated[str, AfterValidator(validate_bcrypt_length)]

class UserSignupRequest(BaseModel):
    name: str
    email: str
    password: BcryptPassword
    referral_code: str | None = None
    enrolled_courses: list[str] = []

class LoginRequest(BaseModel):
    email: str
    password: BcryptPassword

class AuthResponse(BaseModel):
    userId: str
    token: str
    credit: int
    ref_code: str

class GetUnlockedAnswersRequest(BaseModel):
    paper_id: str

class UnlockAnswerRequest(BaseModel):
    question_id: str

class UnlockAnswerResponse(BaseModel):
    message: str
    credit: int