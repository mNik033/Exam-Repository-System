from pydantic import BaseModel

class Course(BaseModel):
    code: str
    name: str