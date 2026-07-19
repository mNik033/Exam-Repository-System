import asyncio
import base64
import re
from datetime import datetime
from bson import ObjectId
from pathlib import Path

from database import papers
from models.paper import Paper
from services import storage

def _decode_cursor(cursor_str: str) -> tuple[str | None, str | None, int, str | None]:
    try:
        decoded = base64.b64decode(cursor_str.encode()).decode()
        if decoded.startswith("atlas_"):
            return None, None, 0, decoded.split("_",1)[1]
        if decoded.startswith("text_"):
            skip_count = int(decoded.split("_")[1])
            return None, None, skip_count, None
            
        session_year, obj_id = decoded.split("_", 1)
        return session_year, obj_id, 0, None
    except Exception:
        return None, None, 0, None

def _encode_cursor(session_year: str, obj_id: str) -> str:
    token = f"{session_year}_{obj_id}"
    return base64.b64encode(token.encode()).decode()

def _encode_atlas_cursor(token: str) -> str:
    return base64.b64encode(f"atlas_{token}".encode()).decode()

def _encode_text_cursor(skip: int) -> str:
    token = f"text_{skip}"
    return base64.b64encode(token.encode()).decode()

async def ensure_paper_indexes() -> None:
    await papers.create_index([
        ("title", "text"),
        ("tags", "text")
    ])
    await papers.create_index([("course_id", 1), ("session_year", -1), ("_id", -1)])
    await papers.create_index([("uploaded_by", 1), ("session_year", -1), ("_id", -1)])
    await papers.create_index([("created_at", -1)])
    await papers.create_index([("course_id", 1), ("session", 1), ("session_year", 1), ("exam_type", 1)])

async def get_all_papers(
    q: str | None = None,
    exam_type: str | None = None,
    session_year: str | None = None,
    course_id: str | None = None,
    cursor: str | None = None,
    limit: int = 10
) -> tuple[list[Paper], str | None]:
    filter_query = {}
    
    if exam_type:
        filter_query["exam_type"] = exam_type
    if session_year:
        filter_query["session_year"] = session_year
    if course_id:
        filter_query["course_id"] = course_id

    last_year, last_id, skip, atlas_token = None, None, 0, None
    if cursor:
        last_year, last_id, skip, atlas_token = _decode_cursor(cursor)

    # MongoDB Atlas Search (relevance ranked)
    if q and len(q.strip()) >= 3:
        pipeline = [
            {
                "$search": {
                    "index": "paper_search_index",
                    "compound": {
                        "should": [
                            {"text": {"query": q, "path": "title", "fuzzy": {"maxEdits": 1}, "score": {"boost": {"value": 3}}}},
                            {"text": {"query": q, "path": "tags", "fuzzy": {"maxEdits": 1}}}
                        ]
                    }
                }
            }
        ]

        if atlas_token:
            pipeline[0]["$search"]["searchAfter"] = atlas_token
        
        if filter_query:
            pipeline.append({"$match": filter_query})

        pipeline.extend([
            {"$addFields": {
                "score": {"$meta": "searchScore"},
                "search_token": {"$meta": "searchSequenceToken"}
            }},
            {"$limit": limit + 1}
        ])

        results = []
        prev_token, curr_token = None, None
        async for doc in papers.aggregate(pipeline):
            doc.pop("score", None)
            prev_token = curr_token
            curr_token = doc.pop("search_token", None)
            doc["_id"] = str(doc["_id"])
            results.append(Paper(**doc))

        next_cursor = None
        if len(results) > limit:
            results.pop()
            if prev_token:
                next_cursor = _encode_atlas_cursor(prev_token)

        return results, next_cursor

    # Fallback to regular find query, if no search query provided
    if last_year and last_id:
        cursor_clause = {
            "$or": [
                {"session_year": {"$lt": last_year}},
                {"session_year": last_year, "_id": {"$lt": ObjectId(last_id)}}
            ]
        }
        if filter_query:
            filter_query = {"$and": [filter_query, cursor_clause]}
        else:
            filter_query = cursor_clause

    db_cursor = papers.find(filter_query).sort([("session_year", -1), ("_id", -1)]).limit(limit + 1)

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

async def exists_paper(course_id: str, session: str, session_year: str, exam_type: str, suffix: int | None) -> str | None:
    paper = await papers.find_one({
        "course_id": course_id,
        "session": session,
        "session_year": session_year,
        "exam_type": exam_type,
        "suffix": suffix
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
    suffix: int | None,
    question_ids: list[str],
    tags: list[str],
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
        "suffix": suffix,
        "question_ids": question_ids,
        "tags": tags,
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

async def get_distinct_paper_filters() -> tuple[list[str], list[str], list[str]]:
    exam_types, session_years, course_ids = await asyncio.gather(
        papers.distinct("exam_type"),
        papers.distinct("session_year"),
        papers.distinct("course_id")
    )
    
    return (
        [et for et in exam_types if et],
        [sy for sy in session_years if sy],
        [cid for cid in course_ids if cid]
    )