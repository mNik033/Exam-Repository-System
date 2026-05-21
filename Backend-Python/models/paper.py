from pydantic import BaseModel, Field
from datetime import datetime

class Paper(BaseModel):
    title: str
    file_path: str
    course_id: str
    uploaded_by: str
    session: str
    session_year: str
    exam_type: str
    question_ids: list[str] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    