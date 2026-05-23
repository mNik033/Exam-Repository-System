from pydantic import BaseModel, Field

class Course(BaseModel):
    id: str | None = Field(default=None, alias="_id")
    code: str
    name: str