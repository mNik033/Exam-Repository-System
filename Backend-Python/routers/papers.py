import os
import shutil
import uuid
from fastapi import APIRouter, File, UploadFile, Depends, BackgroundTasks, status

from repositories import paper_repo
from models.paper import Paper
from models.user import User
from security import get_current_user
from schemas.paper import UploadPaperResponse
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