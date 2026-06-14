from bson import ObjectId
import shutil
import uuid
from fastapi import APIRouter, File, UploadFile, Depends, BackgroundTasks, status, HTTPException

from repositories import course_repo, paper_repo, question_repo, user_repo
from models.paper import Paper
from models.user import User
from security import get_current_user
from schemas.paper import (
    UploadPaperResponse,
    PaperDetailsResponse,
    QuestionPaperResponse,
    BrowsedCourseRequest,
    QuestionIndexResponse,
)

from tasks.paper_processing import process_uploaded_paper_task

router = APIRouter(prefix="/api", tags=["Papers"])

@router.get("/getPapers", response_model=list[Paper])
async def get_papers():
    return await paper_repo.get_all_papers()

@router.post("/uploadPaper", status_code=status.HTTP_202_ACCEPTED, response_model=UploadPaperResponse)
async def upload_paper(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    file_extension = file.filename.split(".")[-1]
    temp_filename = f"pending_{current_user.id}_{uuid.uuid4()}.{file_extension}"
    temp_path = f"uploads/{temp_filename}"

    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # add the background processing task to the queue
    background_tasks.add_task(process_uploaded_paper_task, temp_path, current_user.id)
    
    return UploadPaperResponse(message="Paper uploaded successfully. You'll be notified once processing is complete.")

@router.get("/papers/{paper_id}", response_model=PaperDetailsResponse)
async def get_paper_details(paper_id: str, current_user: User = Depends(get_current_user)):
    try:
        obj_id = ObjectId(paper_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Paper not found")

    paper = await paper_repo.get_paper_by_id(paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    course = await course_repo.get_course_by_id(paper.course_id)

    raw_questions = await question_repo.get_questions_by_ids(paper.question_ids)
    question_map = {q.id: q for q in raw_questions}
    unlocked_set = set(current_user.unlocked_answers)

    ordered_questions = []
    for qid in paper.question_ids:
        q = question_map.get(qid)
        if not q:
            continue

        ordered_questions.append(
            QuestionPaperResponse(
                id=q.id,
                question_text=q.question_text,
                answer_text=q.answer_text if qid in unlocked_set else None,
                tag=q.tag,
                course_id=q.course_id,
                created_at=q.created_at
            )
        )
    
    return PaperDetailsResponse(paper=paper, course=course, questions=ordered_questions)

@router.post("/browsedCourse", status_code=204)
async def update_browsed_course(
    payload: BrowsedCourseRequest,
    current_user: User = Depends(get_current_user)
):
    try:
        obj_id = ObjectId(payload.course_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Course not found")

    course = await course_repo.get_course_by_id(payload.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    await user_repo.add_browsed_course(current_user.id, payload.course_id)

@router.get("/dashboard", response_model=list[Paper])
async def get_dashboard(current_user: User = Depends(get_current_user)):
    # weights: 3 for enrolled courses, 2 for top 3 browsed, rest get 1
    scores = {}

    for cid in current_user.enrolled_courses:
        scores[cid] = scores.get(cid, 0) + 3
    
    for index, cid in enumerate(current_user.browsed_courses):
        weight = 2 if index < 3 else 1
        scores[cid] = scores.get(cid, 0) + weight
    
    sorted_courses = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    top_5 = [cid for cid, score in sorted_courses[:5]]

    if not top_5:
        return await paper_repo.get_recent_papers(limit=5)

    return await paper_repo.list_by_courses(top_5)

@router.get("/questions/index", response_model=list[QuestionIndexResponse])
async def get_questions_index():
    return await question_repo.get_questions(
        projection={"question_text": 1, "course_id": 1, "tag": 1}
    )