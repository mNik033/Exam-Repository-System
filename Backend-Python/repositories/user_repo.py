from bson import ObjectId

from database import users
from models.user import User, Notification

async def get_user_by_email(email: str) -> User | None:
    user_dict = await users.find_one({"email": email})
    if not user_dict:
        return None
    user_dict["_id"] = str(user_dict["_id"])
    return User(**user_dict)

async def get_user_by_id(user_id: str) -> User | None:
    try:
        obj_id = ObjectId(user_id)
    except Exception:
        return None

    user_dict = await users.find_one({"_id": obj_id})
    if not user_dict:
        return None
    user_dict["_id"] = str(user_dict["_id"])
    return User(**user_dict)

async def get_user_by_referral_code(ref_code: str) -> User | None:
    user_dict = await users.find_one({"ref_code": ref_code})
    if not user_dict:
        return None
    user_dict["_id"] = str(user_dict["_id"])
    return User(**user_dict)

async def create_user(user: User) -> str:
    # convert the Pydantic model to a dictionary suitable for MongoDB
    user_dict = user.model_dump(exclude={"id"})

    result = await users.insert_one(user_dict)

    # return the generated ObjectId as a string
    return str(result.inserted_id)

async def update_credits(user_id: str, amount: int) -> None:
    await users.update_one(
        {"_id": ObjectId(user_id)},
        {"$inc": {"credit": amount}}
    )

async def add_notification(
    user_id: str, message: str, type: str, paper_id: str | None = None
) -> None:
    notification = Notification(message=message, type=type, paper_id=paper_id)
    await users.update_one(
        {"_id": ObjectId(user_id)},
        {
            "$push": {
                "notifications": {
                    "$each": [notification.model_dump()],
                    "$position": 0,
                    "$slice": 100
                }
            }
        }
    )

async def get_notifications(user_id: str) -> list[Notification]:
    doc = await users.find_one(
        {"_id": ObjectId(user_id)},
        {"notifications": 1}
    )
    if not doc or "notifications" not in doc:
        return []
    return [Notification(**n) for n in doc["notifications"]]

async def mark_notifications_read(user_id: str) -> None:
    await users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"notifications.$[].is_read": True}}
    )

async def unlock_answer(user_id: str, question_id: str) -> bool:
    result = await users.update_one(
        {
            "_id": ObjectId(user_id),
            "credit": {"$gte": 5},
            "unlocked_answers": {"$ne": question_id}
        },
        {
            "$inc": {"credit": -5},
            "$push": {"unlocked_answers": question_id}
        }
    )

    return result.modified_count > 0

