import base64
from datetime import datetime
from bson import ObjectId
from pathlib import Path

from database import papers
from models.paper import Paper
from services import storage

def _decode_cursor(cursor_str: str) -> tuple[str, str] | None:
    try:
        decoded = base64.b64decode(cursor_str.encode()).decode()
        session_year, obj_id = decoded.split("_", 1)
        return session_year, obj_id
    except Exception:
        return None

def _encode_cursor(session_year: str, obj_id: str) -> str:
    token = f"{session_year}_{obj_id}"
    return base64.b64encode(token.encode()).decode()

async def get_all_papers(cursor: str | None = None, limit: int = 10) -> tuple[list[Paper], str | None]:
    query = {}

    if cursor:
        decoded = _decode_cursor(cursor)
        if decoded:
            last_year, last_id = decoded
            query = {
                "$or": [
                    {"session_year": {"$lt": last_year}},
                    {"session_year": last_year, "_id": {"$lt": ObjectId(last_id)}}
                ]
            }

    db_cursor = papers.find(query).sort([("session_year", -1), ("_id", -1)]).limit(limit + 1)

    results = []
    async for doc in db_cursor:
        doc["_id"] = str(doc["_id"])
        results.append(Paper(**doc))
    
    next_cursor = None
    if len(results) > limit:
        results.pop()
        last_item = results[-1]
        next_cursor = _encode_cursor(last_item.session_year, last_item.id)
    
    return results, next_cursor

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

async def list_by_courses(course_ids: list[str]) -> list[Paper]:
    cursor = papers.find({"course_id": {"$in": course_ids}}).sort("session_year", -1)
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

async def get_recent_papers(limit: int = 10) -> list[Paper]:
    cursor = papers.find().sort("created_at", -1).limit(limit)
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
    question_ids: list[str],
    processing_model: int,
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
        "processing_model": processing_model,
        "created_at": datetime.utcnow()
    }
    result = await papers.insert_one(paper_doc)
    return str(result.inserted_id)

async def delete_paper(paper_id: str) -> bool:
    # delete the file as well from uploads directory
    paper = await get_paper_by_id(paper_id)
    await storage.delete_file(paper.file_path)
    result = await papers.delete_one({"_id": ObjectId(paper_id)})
    return result.deleted_count > 0

async def get_papers_pending_upgrade(target_model: int, limit: int = 5) -> list[Paper]:
    # find papers that have not been upgraded to the target model yet
    cursor = papers.find({
        "$or": [
            {"processing_model": {"$exists": False}},
            {"processing_model": {"$lt": target_model}}
        ]
    }).limit(limit)

    results = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        results.append(Paper(**doc))
    return results

async def mark_paper_upgraded(paper_id: str, new_model: int) -> bool:
    result = await papers.update_one(
        {"_id": ObjectId(paper_id)},
        {"$set": {"processing_model": new_model}}
    )
    return result.modified_count > 0