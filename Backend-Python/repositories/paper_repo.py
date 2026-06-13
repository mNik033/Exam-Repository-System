import os
from datetime import datetime
from bson import ObjectId

from database import papers
from models.paper import Paper

async def get_all_papers() -> list[Paper]:
    cursor = papers.find().sort("session_year", -1)
    results = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        results.append(Paper(**doc))
    return results

async def get_paper_by_id(paper_id: str) -> Paper | None:
    doc = await papers.find_one({"_id": ObjectId(paper_id)})
    if not doc:
        return None
    doc["_id"] = str(doc["_id"])
    return Paper(**doc)

async def get_question_ids(paper_id: str) -> list[str] | None:
    doc = await papers.find_one(
        {"_id": ObjectId(paper_id)},
        {"question_ids": 1}
    )
    if not doc:
        return None
    return doc.get("question_ids", [])

async def exists_paper(course_id: str, session: str, session_year: str, exam_type: str) -> str | None:
    paper = await papers.find_one({
        "course_id": course_id,
        "session": session,
        "session_year": session_year,
        "exam_type": exam_type
    }, projection={"_id": 1})

    return str(paper["_id"]) if paper else None

async def list_by_course(course_id: str) -> list[Paper]:
    cursor = papers.find({"course_id": course_id}).sort("session_year", -1)
    results = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        results.append(Paper(**doc))
    return results

async def list_by_user(user_id: str) -> list[Paper]:
    cursor = papers.find({"uploaded_by": user_id}).sort("session_year", -1)
    results = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        results.append(Paper(**doc))
    return results

async def create_paper(
    title: str,
    file_path: str,
    course_id: str,
    uploaded_by: str,
    session: str,
    session_year: str,
    exam_type: str,
    question_ids: list[str]
) -> str:
    paper_doc = {
        "title": title,
        "file_path": file_path,
        "course_id": course_id,
        "uploaded_by": uploaded_by,
        "session": session,
        "session_year": session_year,
        "exam_type": exam_type,
        "question_ids": question_ids,
        "created_at": datetime.utcnow()
    }
    result = await papers.insert_one(paper_doc)
    return str(result.inserted_id)

async def delete_paper(paper_id: str) -> bool:
    # delete the file as well from uploads directory
    paper = await get_paper_by_id(paper_id)
    if paper and os.path.exists(paper.file_path):
        os.remove(paper.file_path)
    result = await papers.delete_one({"_id": ObjectId(paper_id)})
    return result.deleted_count > 0