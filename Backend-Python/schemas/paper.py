from pydantic import BaseModel, Field
from datetime import datetime

from models.paper import Paper
from models.course import Course

class QuestionPaperResponse(BaseModel):
    id: str = Field(default=None, alias="_id")
    q_no: str
    question_text: str
    answer_text: str | None = None
    tag: str
    course_id: str
    created_at: datetime

class QuestionIndexResponse(BaseModel):
    id: str = Field(default=None, alias="_id")
    question_text: str
    course_id: str
    tag: str

class PaperDetailsResponse(BaseModel):
    paper: Paper
    course: Course
    questions: list[QuestionPaperResponse]

class BrowsedCourseRequest(BaseModel):
    course_id: str

class UploadPaperResponse(BaseModel):
    message: str
    paper_id: str | None = None

class SearchPaperResponse(Paper):
    matched_questions: list[QuestionIndexResponse] = []

class PaginatedSearchResponse(BaseModel):
    papers: list[SearchPaperResponse] = []
    next_cursor: str | None = None

class CourseFilterResponse(BaseModel):
    id: str
    code: str
    name: str

class PaperFiltersResponse(BaseModel):
    exam_types: list[str]
    session_years: list[str]
    courses: list[CourseFilterResponse]