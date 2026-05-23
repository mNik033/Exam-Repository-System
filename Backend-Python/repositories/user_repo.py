from bson import ObjectId
from database import users
from models.user import User

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

async def create_user(user: User) -> str:
    # convert the Pydantic model to a dictionary suitable for MongoDB
    user_dict = user.model_dump(exclude={"id"})

    result = await users.insert_one(user_dict)

    # return the generated ObjectId as a string
    return str(result.inserted_id)