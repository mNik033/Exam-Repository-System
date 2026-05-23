from pydantic import BaseModel, Field
from datetime import datetime

class Question(BaseModel):
    id: str | None = Field(default=None, alias="_id")
    question_text: str
    answer_text: str
    tag: str
    course_id: str
    embedding: list[float] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)