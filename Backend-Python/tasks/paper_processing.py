import logging

logger = logging.getLogger(__name__)

async def process_uploaded_paper_task(file_path: str, user_id: str):
    # placeholder for now
    logger.info(f"Background task triggered for {file_path} uploaded by user {user_id}")
