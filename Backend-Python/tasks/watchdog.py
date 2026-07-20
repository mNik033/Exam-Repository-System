import asyncio
import logging

from config import settings
from database import redis_client
from repositories import paper_repo, upload_registry_repo, user_repo
from services.storage import storage
from tasks.paper_processing import process_uploaded_paper_task

logger = logging.getLogger(__name__)

async def listen_for_dead_workers():
    await redis_client.config_set("notify-keyspace-events", "Ex")

    # listens for expired Redis locks indicating a crashed background worker
    while True:
        try:
            pubsub = redis_client.pubsub()
            await pubsub.subscribe("__keyevent@0__:expired")
            
            logger.info("Watchdog subscriber listening for crashed workers...")

            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue

                expired_key = message["data"].decode("utf-8")

                prefix = f"{settings.REDIS_PREFIX}:lock:process_paper:"
                if not expired_key.startswith(prefix):
                    continue

                file_hash = expired_key[len(prefix):]
                logger.warning(f"Watchdog detected crashed worker for file {file_hash}. Reconciling...")

                # check if it's still stuck in processing
                record = await upload_registry_repo.get_record(file_hash)
                if not record or record.status != "processing":
                    continue

                # check if the answer generation actually finished
                existing_paper = await paper_repo.get_paper_by_hash(file_hash)
                if existing_paper:
                    logger.info(f"Paper {file_hash} was saved successfully before crash. Fixing registry and notifying.")
                    for sub in record.subscribers:
                        if sub == record.subscribers[0]:
                            await user_repo.update_credits(sub, 100)
                            msg = f"Your paper '{existing_paper.title}' has been successfully processed! +100 credits awarded."
                        else:
                            msg = f"Your paper '{existing_paper.title}' has been successfully processed!"
                        
                        await user_repo.add_notification(
                            user_id=sub,
                            message=msg,
                            type="success",
                            paper_id=existing_paper.id
                        )

                    await upload_registry_repo.mark_completed(file_hash, existing_paper.id)
                    continue

                # paper was not processed. check if file exists
                pending_files = await storage.list_files(prefix="pending/")
                pending_file = next((f for f in pending_files if file_hash in f), None)

                if pending_file:
                    logger.info(f"File {file_hash} still pending. Restarting background task.")
                    user_id = pending_file.split("_")[1]

                    asyncio.create_task(process_uploaded_paper_task(pending_file, user_id))
                else:
                    logger.error(f"File {file_hash} is missing from R2 pending bucket. Abandoning and notifying.")
                    subscribers = await upload_registry_repo.delete_record(file_hash)
                    for sub in subscribers:
                        await user_repo.add_notification(
                            user_id=sub,
                            message="Your uploaded paper was lost due to a server issue. Please try uploading again.",
                            type="error"
                        )

        except Exception as e:
            logger.error(f"Watchdog lost connection to Redis: {e}. Reconnecting in 10s...")
            await asyncio.sleep(10)