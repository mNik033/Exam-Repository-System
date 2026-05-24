from pydantic import BaseModel

class UploadPaperResponse(BaseModel):
    message: str
    paper_id: str | None = None