from datetime import datetime, timezone
from pymongo.errors import DuplicateKeyError
from database import processed_payments

async def mark_payment_processed(payment_id: str) -> bool:
    try:
        await processed_payments.insert_one({"_id": payment_id})
        return True
    except DuplicateKeyError:
        return False
