from datetime import datetime, timezone
from pymongo.errors import DuplicateKeyError
from database import upload_registry
from models.upload_registry import UploadRegistry

async def create_record(file_hash: str, user_id: str) -> bool:
    doc = UploadRegistry(
        _id=file_hash,
        status="processing",
        subscribers=[user_id]
    )
    try:
        await upload_registry.insert_one(doc.model_dump(by_alias=True))
        return True
    except DuplicateKeyError:
        return False

async def get_record(file_hash: str) -> UploadRegistry | None:
    doc = await upload_registry.find_one({"_id": file_hash})
    if not doc:
        return None
    return UploadRegistry(**doc)

async def add_subscriber(file_hash: str, user_id: str) -> bool:
    result = await upload_registry.update_one(
        {"_id": file_hash},
        {"$addToSet": {"subscribers": user_id}}
    )
    return result.modified_count > 0

async def mark_completed(file_hash: str, paper_id: str) -> list[str]:
    result = await upload_registry.find_one_and_update(
        {"_id": file_hash},
        {"$set": {"status": "completed", "paper_id": paper_id}},
        return_document=True
    )
    return result.get("subscribers", []) if result else []

async def mark_rejected(file_hash: str) -> list[str]:
    result = await upload_registry.find_one_and_update(
        {"_id": file_hash},
        {"$set": {"status": "rejected"}},
        return_document=True
    )
    return result.get("subscribers", []) if result else []

async def delete_record(file_hash: str) -> list[str]:
    result = await upload_registry.find_one_and_delete({"_id": file_hash})
    return result.get("subscribers", []) if result else []
