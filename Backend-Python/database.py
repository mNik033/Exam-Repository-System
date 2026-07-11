from motor.motor_asyncio import AsyncIOMotorClient
import redis.asyncio as redis
from config import settings

client = AsyncIOMotorClient(settings.MONGO_URI)
db = client[settings.DB_NAME]

redis_client = redis.from_url(
    settings.REDIS_URL,
    decode_responses=True,
    password=settings.REDIS_PASSWORD
)

courses = db["courses"]
otps = db["otps"]
papers = db["papers"]
questions = db["questions"]
users = db["users"]
upload_registry = db["upload_registry"]
processed_payments = db["processed_payments"]