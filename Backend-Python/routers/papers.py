import blake3
import shutil
import time
import uuid
from datetime import datetime
from bson import ObjectId
from fastapi import APIRouter, File, UploadFile, Depends, BackgroundTasks, Request, status, HTTPException
from pathlib import Path

from repositories import course_repo, paper_repo, question_repo, user_repo, upload_registry_repo
from models.paper import Paper, PaginatedPaperResponse
from models.user import User
from security import get_current_user, guard
from services.storage import storage
from schemas.paper import (
    UploadPaperResponse,
    PaperDetailsResponse,
    QuestionPaperResponse,
    BrowsedCourseRequest,
    QuestionIndexResponse,
    PaginatedSearchResponse,
    SearchPaperResponse,
    PaperFiltersResponse,
)
from services.metrics import paper_upload_validation_failures_total, course_browsed_total

from tasks.paper_processing import process_uploaded_paper_task

router = APIRouter(prefix="/api", tags=["Papers"])

MAX_FILE_SIZE = 10 * 1024 * 1024

async def _read_file_with_size_limit(file: UploadFile, max_size: int = MAX_FILE_SIZE) -> bytes:
    file_bytes = bytearray()
    
    await file.seek(0)
    
    while chunk := await file.read(1024 * 1024):
        file_bytes.extend(chunk)
        if len(file_bytes) > max_size:
            paper_upload_validation_failures_total.labels(reason="size_limit").inc()
            raise HTTPException(
                status_code=413, 
                detail=f"File is too large. Maximum size is {max_size // (1024*1024)}MB."
            )
            
    await file.seek(0)
    
    return bytes(file_bytes)

@router.get("/getPapers", response_model=PaginatedSearchResponse)
async def get_papers(
    q: str | None = None,
    exam_type: str | None = None,
    session_year: str | None = None,
    course_id: str | None = None,
    cursor: str | None = None,
    limit: int = 10
):
    limit = min(limit, 50)
    papers_list, next_cursor = await paper_repo.get_all_papers(
        q, exam_type, session_year, course_id, cursor, limit
    )
    
    for paper in papers_list:
        paper.file_path = storage.get_url(paper.file_path)
    
    # if a search query is active, find and attach matching questions
    papers_with_matches = []
    if q and len(q.strip()) >= 3 and papers_list:
        all_q_ids = [pq.id for paper in papers_list for pq in paper.questions]

        all_questions = await question_repo.get_questions_by_ids(all_q_ids)
        question_map = {question.id: question for question in all_questions}

        q_lower = q.lower()

        for paper in papers_list:
            matched_qs = []
            
            if q_lower not in paper.title.lower():
                for pq in paper.questions:
                    question = question_map.get(pq.id)
                    if not question:
                        continue
                    
                    if question.tag and q_lower in question.tag.lower():
                        matched_qs.append(QuestionIndexResponse(
                            _id=question.id,
                            question_text=question.question_text,
                            course_id=question.course_id,
                            tag=question.tag
                        ))
            
            paper_data = paper.dict(by_alias=True)
            paper_data["matched_questions"] = matched_qs
            papers_with_matches.append(SearchPaperResponse(**paper_data))
    else:
        for paper in papers_list:
            paper_data = paper.dict(by_alias=True)
            paper_data["matched_questions"] = []
            papers_with_matches.append(SearchPaperResponse(**paper_data))

    return PaginatedSearchResponse(papers=papers_with_matches, next_cursor=next_cursor)

@router.get("/papers/filters", response_model=PaperFiltersResponse)
async def get_paper_filters():
    exam_types, session_years, course_ids = await paper_repo.get_distinct_paper_filters()
    courses = await course_repo.get_courses_by_ids(course_ids)
    
    return {
        "exam_types": exam_types,
        "session_years": session_years,
        "courses": courses
    }

@router.get("/myPapers", response_model=list[Paper])
async def get_my_papers(current_user: User = Depends(get_current_user)):
    # fetch processed papers from database
    papers_list = await paper_repo.list_by_user(current_user.id)
    for paper in papers_list:
        paper.file_path = storage.get_url(paper.file_path)

    # check for active pending files in uploads folder
    pending_papers = []
    pending_files = await storage.list_files(prefix="pending/")
    for file in pending_files:
        filename = Path(file).name
        parts = filename.split("_", 3)
        
        # parts format: [timestamp, user_id, uuid, safe_filename]
        if len(parts) > 1 and parts[1] == current_user.id:
            original_name = parts[3] if len(parts) > 3 else "Uploaded Document"
            filepath = storage.get_url(file)
            
            try:
                created_at = datetime.fromtimestamp(int(parts[0]))
            except (ValueError, IndexError):
                created_at = datetime.utcnow()
                
                pending_papers.append(
                    Paper(
                        _id=f"pending_{filename}",
                        title=f"[Processing] {original_name}",
                        file_path=filepath,
                        course_id="pending",
                        uploaded_by=current_user.id,
                        session="Pending",
                        session_year="Pending",
                        exam_type="Pending",
                        questions=[],
                        created_at=created_at
                    )
                )

    pending_papers.sort(key=lambda x: x.created_at, reverse=True)
    return pending_papers + papers_list

async def check_duplicate_and_lock(file_hash: str, user_id: str):
    # try to lock the file for processing
    is_new = await upload_registry_repo.create_record(file_hash, user_id)
    if is_new:
        return
    
    record = await upload_registry_repo.get_record(file_hash)
    if not record: # the file was processed just as we got here
        return

    if record.status == "processing":
        await upload_registry_repo.add_subscriber(file_hash, user_id)
        paper_upload_validation_failures_total.labels(reason="already_processing").inc()
        raise HTTPException(
            status_code=409,
            detail="This file is already being processed. You'll be notified once processing is complete."
        )
    elif record.status == "completed":
        await user_repo.add_notification(
            user_id,
            message="This paper has already been processed. Click on this notification to view the paper.",
            type="info",
            paper_id=record.paper_id
        )
        paper_upload_validation_failures_total.labels(reason="already_completed").inc()
        raise HTTPException(
            status_code=409,
            detail="This paper has already been processed. Check your notifications for the same."
        )
    elif record.status == "rejected":
        paper_upload_validation_failures_total.labels(reason="already_rejected").inc()
        raise HTTPException(
            status_code=422,
            detail="This paper has previously been analyzed and rejected. Please ensure you're uploading a valid exam paper."
        )

@router.post("/uploadPaper", status_code=status.HTTP_202_ACCEPTED, response_model=UploadPaperResponse)
@guard.rate_limit(requests=5, window=60)
@guard.max_request_size(MAX_FILE_SIZE)
async def upload_paper(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    # fast rejection based on headers
    if "content-length" in request.headers:
        if int(request.headers["content-length"]) > MAX_FILE_SIZE:
            paper_upload_validation_failures_total.labels(reason="size_limit").inc()
            raise HTTPException(
                status_code=413, 
                detail=f"File is too large. Maximum limit is {MAX_FILE_SIZE//(1024*1024)}MB."
            )

    # magic number validation
    header = await file.read(10)
    await file.seek(0)
    
    is_pdf = header.startswith(b"%PDF-")
    is_jpeg = header.startswith(b"\xff\xd8\xff")
    is_png = header.startswith(b"\x89PNG\r\n\x1a\n")
    
    if not (is_pdf or is_jpeg or is_png):
        paper_upload_validation_failures_total.labels(reason="invalid_format").inc()
        raise HTTPException(
            status_code=400, 
            detail="Invalid file format. Only true PDF, JPEG, and PNG files are supported."
        )

    # hashing and deduplication
    file_bytes = await _read_file_with_size_limit(file)
    file_hash = blake3.blake3(file_bytes).hexdigest()
    await file.seek(0)

    await check_duplicate_and_lock(file_hash, current_user.id)

    file_extension = file.filename.split(".")[-1]
    
    # sanitize the original filename to keep it safe for paths and splits
    safe_filename = "".join(c for c in file.filename if c.isalnum() or c in "._-").strip()
    if not safe_filename:
        safe_filename = f"document.{file_extension}"
    
    # truncate to avoid file name too long error
    base_name = safe_filename.rsplit(".", 1)[0]
    if len(base_name) > 100:
        safe_filename = f"{base_name[:100]}.{file_extension}"
    
    timestamp = int(time.time())
    temp_filename = f"{timestamp}_{current_user.id}_{file_hash}_{safe_filename}"
    temp_key = f"pending/{temp_filename}"
    await storage.save_upload(file.file, temp_key)

    # add the background processing task to the queue
    background_tasks.add_task(process_uploaded_paper_task, temp_key, current_user.id)
    
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
    paper.file_path = storage.get_url(paper.file_path)

    course = await course_repo.get_course_by_id(paper.course_id)

    q_ids = [pq.id for pq in paper.questions]
    raw_questions = await question_repo.get_questions_by_ids(q_ids)
    question_map = {q.id: q for q in raw_questions}
    unlocked_set = set(current_user.unlocked_answers)

    ordered_questions = []
    for pq in paper.questions:
        q = question_map.get(pq.id)
        if not q:
            continue

        ordered_questions.append(
            QuestionPaperResponse(
                _id=q.id,
                q_no=pq.q_no,
                question_text=q.question_text,
                answer_text=q.answer_text if pq.id in unlocked_set else None,
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

    course_browsed_total.labels(course_code=course.code).inc()
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

    papers_list = []
    if not top_5:
        papers_list = await paper_repo.get_recent_papers(limit=5)
    else:
        papers_list = await paper_repo.list_by_courses(top_5)
        
    for paper in papers_list:
        paper.file_path = storage.get_url(paper.file_path)
        
    return papers_list

@router.get("/questions/index", response_model=list[QuestionIndexResponse])
async def get_questions_index():
    return await question_repo.get_questions(
        projection={"question_text": 1, "course_id": 1, "tag": 1}
    )