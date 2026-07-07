from motor.motor_asyncio import AsyncIOMotorClient
from config import settings

client = AsyncIOMotorClient(settings.MONGO_URI)
db = client[settings.DB_NAME]

courses = db["courses"]
otps = db["otps"]
papers = db["papers"]
questions = db["questions"]
users = db["users"]
upload_registry = db["upload_registry"]
processed_payments = db["processed_payments"]