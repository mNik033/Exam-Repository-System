import os
import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from guard.middleware import SecurityMiddleware

from config import settings
from database import client
from security import security_config, guard

from routers.users import router as users_router
from routers.courses import router as courses_router
from routers.papers import router as papers_router
from routers.payments import router as payments_router
from repositories.question_repo import ensure_indexes

from tasks.paper_processing import process_uploaded_paper_task
from tasks import upgrade_answers_task

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # verify DB is reachable
    await client.admin.command('ping')
    print("Connnected to DB")

    # try upgrading answers to a better model
    upgrade_task = asyncio.create_task(
        upgrade_answers_task.start_background_upgrade_task(interval_seconds=21600)
    )

    # ensure MongoDB text index on questions collection
    await ensure_indexes()

    # scan for and process pending files
    await scan_and_process_pending_papers()

    yield

    upgrade_task.cancel()

    client.close()
    print("Connnected closed")

app = FastAPI(
    title="Exam Repository System",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    SecurityMiddleware,
    config=security_config
)

app.state.guard_decorator = guard

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.include_router(users_router)
app.include_router(courses_router)
app.include_router(papers_router)
app.include_router(payments_router)

@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}

@app.get("/api/config")
async def get_config():
    return {
        "unlock_cost": settings.UNLOCK_COST
    }

async def scan_and_process_pending_papers():
    pending_prefix = "pending_"
    pending_files = [f for f in os.listdir('uploads') if f.startswith(pending_prefix)]

    for file in pending_files:
        file_path = os.path.join('uploads', file)
        try:
            user_id = file.split('_')[1]
            asyncio.create_task(process_uploaded_paper_task(file_path, user_id))
        except Exception as e:
            logger.error(f"Failed to process {file_path}: {str(e)}")

