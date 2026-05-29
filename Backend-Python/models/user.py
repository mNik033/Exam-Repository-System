from pydantic import BaseModel, Field
from datetime import datetime

class UnlockedAnswer(BaseModel):
    paper_id: str
    question_ids: list[str] = []

class Notification(BaseModel):
    message: str
    type: str
    is_read: bool = False
    paper_id: str | None = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class User(BaseModel):
    id: str | None = Field(default=None, alias="_id")
    name: str
    email: str
    password_hash: str
    credit: int = 100
    ref_code: str
    enrolled_courses: list[str] = []
    browsed_courses: list[str] = []
    notifications: list[Notification] = []
    unlocked_answers: list[UnlockedAnswer] = []