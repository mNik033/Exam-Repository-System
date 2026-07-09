import asyncio
import logging
import secrets
from contextlib import asynccontextmanager
from fastapi import FastAPI, Response, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from guard.middleware import SecurityMiddleware
from pathlib import Path
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

from config import settings
from database import client, otps
from security import security_config, guard

from routers.users import router as users_router
from routers.courses import router as courses_router
from routers.papers import router as papers_router
from routers.payments import router as payments_router
from repositories.question_repo import ensure_question_indexes
from repositories.paper_repo import ensure_paper_indexes
from services.storage import storage

from tasks.paper_processing import process_uploaded_paper_task
from tasks import upgrade_answers_task

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # verify DB is reachable
    await client.admin.command('ping')
    print("Connnected to DB")
    await otps.create_index([("created_at", 1)], expireAfterSeconds=300)

    # try upgrading answers to a better model
    upgrade_task = asyncio.create_task(
        upgrade_answers_task.start_background_upgrade_task(interval_seconds=21600)
    )

    # ensure MongoDB text index on papers and questions collections
    await ensure_question_indexes()
    await ensure_paper_indexes()

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

Path("uploads").mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.include_router(users_router)
app.include_router(courses_router)
app.include_router(papers_router)
app.include_router(payments_router)

if settings.PROMETHEUS_TOKEN:
    bearer_scheme = HTTPBearer()

    def verify_prometheus_token(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
        if not secrets.compare_digest(credentials.credentials, settings.PROMETHEUS_TOKEN):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Prometheus token"
            )

    @app.get("/metrics", include_in_schema=False)
    def get_metrics(token=Depends(verify_prometheus_token)):
        return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}

@app.get("/api/config")
async def get_config():
    return {
        "unlock_cost": settings.UNLOCK_COST
    }

async def scan_and_process_pending_papers():
    pending_prefix = "pending/"
    pending_files = await storage.list_files(prefix=pending_prefix)
    
    for file in pending_files:
        filename = Path(file).name
        try:
            parts = filename.split('_', 3)
            user_id = parts[1]
            asyncio.create_task(process_uploaded_paper_task(file, user_id))
        except Exception as e:
            logger.error(f"Failed to process {file}: {str(e)}")

