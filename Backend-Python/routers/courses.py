from fastapi import APIRouter

from repositories import course_repo
from models.course import Course

router = APIRouter(prefix="/api/courses", tags=["Courses"])

@router.get("", response_model=list[Course])
async def list_courses():
    return await course_repo.get_all_courses()