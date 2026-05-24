from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from config import settings
from database import client

from routers.users import router as users_router
from routers.courses import router as courses_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # verify DB is reachable
    await client.admin.command('ping')
    print("Connnected to DB")

    yield

    client.close()
    print("Connnected closed")

app = FastAPI(
    title="Exam Repository System",
    version="0.1.0",
    lifespan=lifespan,
)

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

@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}