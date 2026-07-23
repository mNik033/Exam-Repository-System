from pydantic import BaseModel, Field
from datetime import datetime

class PaperQuestion(BaseModel):
    id: str
    q_no: str

class Paper(BaseModel):
    id: str | None = Field(default=None, alias="_id")
    title: str
    file_path: str
    file_hash: str
    course_id: str
    uploaded_by: str
    session: str
    session_year: str
    exam_type: str
    suffix: int | None = None
    questions: list[PaperQuestion] = []
    tags: list[str] = []
    processing_model: int = 1
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
class PaginatedPaperResponse(BaseModel):
    papers: list[Paper]
    next_cursor: str | None = None