from bson import ObjectId

from models.course import Course
from database import courses

async def get_all_courses() -> list[Course]:
    cursor = courses.find({})
    courses_list = await cursor.to_list(length=None)

    result = []
    for c in courses_list:
        c["_id"] = str(c["_id"])
        result.append(Course(**c))

    return result

async def get_course_by_id(course_id: str) -> Course | None:
    try:
        obj_id = ObjectId(course_id)
    except Exception:
        return None

    course_dict = await courses.find_one({"_id": obj_id})
    if not course_dict:
        return None
        
    course_dict["_id"] = str(course_dict["_id"])
    return Course(**course_dict)

async def get_courses_by_ids(course_ids: list[str]) -> list[Course]:
    valid_ids = []
    for cid in course_ids:
        try:
            valid_ids.append(ObjectId(cid))
        except Exception:
            continue
            
    cursor = courses.find({"_id": {"$in": valid_ids}}).sort("code", 1)
    results = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        results.append(Course(**doc))
    return results

async def get_course_by_code(code: str) -> Course | None:
    course_dict = await courses.find_one({"code": code})
    if not course_dict:
        return None
    
    course_dict["_id"] = str(course_dict["_id"])
    return Course(**course_dict)

async def get_courses_by_name(course_name: str) -> list[Course]:
    cursor = courses.find({"name": {"$regex": course_name, "$options": "i"}})
    courses_list = []
    async for course in cursor:
        course["_id"] = str(course["_id"])
        courses_list.append(Course(**course))
    return courses_list

async def create_course(course: Course) -> str:
    course_dict = course.model_dump(exclude={"id"})
    result = await courses.insert_one(course_dict)
    return str(result.inserted_id)

async def upsert_course(course: Course) -> None:
    course_dict = course.model_dump(exclude={"id"})
    await courses.update_one(
        {"code": course.code}, 
        {"$set": course_dict}, 
        upsert=True
    )
