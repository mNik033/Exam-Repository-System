from pydantic import BaseModel, Field
from datetime import datetime, timezone
from typing import Literal

class UploadRegistry(BaseModel):
    id: str = Field(alias="_id")
    status: Literal["processing", "completed", "rejected"]
    subscribers: list[str] = []
    paper_id: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)