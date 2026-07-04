from bson import ObjectId

from database import questions
from models.question import Question

async def ensure_text_index() -> None:
    await questions.create_index([("question_text", "text")])

async def get_questions(projection: dict | None = None) -> list[dict]:
    cursor = questions.find({}, projection)
    results = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        results.append(doc)
    return results

async def get_question_by_id(question_id: str) -> Question | None:
    doc = await questions.find_one({"_id": ObjectId(question_id)})
    if not doc:
        return None
    doc["_id"] = str(doc["_id"])
    return Question(**doc)

async def get_questions_by_ids(question_ids: list[str]) -> list[Question]:
    object_ids = [ObjectId(question_id) for question_id in question_ids]
    cursor = questions.find({"_id": {"$in": object_ids}})
    results = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        results.append(Question(**doc))
    return results

async def find_exact_match(course_id: str, question_text: str) -> Question | None:
    doc = await questions.find_one({
        "course_id": course_id,
        "question_text": question_text
    })
    if not doc:
        return None
    doc["_id"] = str(doc["_id"])
    return Question(**doc)

async def find_by_course(course_id: str, sort_by_field: str | None = None, sort_order: int = -1) -> list[Question]:
    cursor = questions.find({"course_id": course_id})
    if sort_by_field:
        cursor = cursor.sort(sort_by_field, sort_order)
    results = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        results.append(Question(**doc))
    return results

async def create_question(question: Question) -> str:
    question_dict = question.model_dump(exclude_unset=True, exclude={"id"})
    result = await questions.insert_one(question_dict)
    return str(result.inserted_id)

async def create_questions_bulk(questions_list: list[Question]) -> list[str]:
    question_dicts = [q.model_dump(exclude_unset=True, exclude={"id"}) for q in questions_list]
    if not question_dicts:
        return []
    result = await questions.insert_many(question_dicts)
    return [str(inserted_id) for inserted_id in result.inserted_ids]

async def count_for_course(course_id: str) -> int:
    return await questions.count_documents({"course_id": course_id})
    
async def update_question_answer(question_id: str, new_answer: str, new_model: int) -> bool:
    result = await questions.update_one(
        {"_id": ObjectId(question_id)},
        {"$set": {
            "answer_text": new_answer,
            "answer_model": new_model
        }}
    )
    return result.modified_count > 0