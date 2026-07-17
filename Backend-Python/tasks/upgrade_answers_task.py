import asyncio
import logging
from config import settings
from database import redis_client
from repositories import paper_repo, question_repo
from services import gemini, storage
from tasks import paper_processing

logger = logging.getLogger(__name__)

TARGET_MODEL = 2

async def run_upgrade_batch():
    logger.info("Starting background answer upgrade batch...")

    papers = await paper_repo.get_papers_pending_upgrade(TARGET_MODEL, limit=5)
    if not papers:
        logger.info("No papers need upgrading. Exiting.")
        return
    
    try:
        api_context = gemini.ANSWER_MODELS[TARGET_MODEL].pool.acquire()
    except gemini.AllKeysExhaustedError:
        logger.warning("No API keys available for background upgrade. Try again later.")
        return

    for paper in papers:
        lock_key = f"{settings.REDIS_PREFIX}:lock:upgrade_paper:{paper.id}"
        lock_acquired = await redis_client.set(lock_key, "locked", nx=True, ex=900)
        if not lock_acquired:
            logger.info("Skipping paper %s - already being processed", paper.id)
            continue

        logger.info(f"Upgrading answers for paper: {paper.title}")

        client = api_context.client
        limiter = api_context.rate_limiter

        questions = await question_repo.get_questions_by_ids(paper.question_ids)
        pending_questions = [q for q in questions if q.answer_model < TARGET_MODEL]
        
        if not pending_questions:
            await paper_repo.mark_paper_upgraded(paper.id, TARGET_MODEL)
            continue

        file_name = None
        cache_name = None

        try:
            async with storage.download(paper.file_path) as local_path:
                upload_result = await gemini.upload_file(local_path, client)
            file_name = upload_result.name

            cache_name = await gemini.create_context_cache(
                file_uri=upload_result.uri,
                mime_type=paper_processing.get_mime_type(paper.file_path),
                client=client,
                target_model=TARGET_MODEL
            )

            ques_texts = [q.question_text for q in pending_questions]
            new_answers, failed_indices = await gemini.generate_answers_parallel(
                ques_texts=ques_texts,
                file_uri=upload_result.uri,
                mime_type=paper_processing.get_mime_type(paper.file_path),
                client=client,
                limiter=limiter,
                cache_name=cache_name,
                target_model=TARGET_MODEL
            )

            if failed_indices:
                raise Exception("Failed to generate some answers in batch")

            for idx, q in enumerate(pending_questions):
                await question_repo.update_question_answer(q.id, new_answers[idx], TARGET_MODEL)

            await paper_repo.mark_paper_upgraded(paper.id, TARGET_MODEL)
            logger.info(f"Successfully upgraded {len(pending_questions)} questions for {paper.title}")

        except gemini.DailyQuotaExhaustedError:
            logger.warning("Key hit daily quota. Switching to next key...")
            gemini.ANSWER_MODELS[TARGET_MODEL].pool.mark_exhausted(api_context)
            try:
                api_context = gemini.ANSWER_MODELS[TARGET_MODEL].pool.acquire()
            except gemini.AllKeysExhaustedError:
                logger.error("All keys exhausted. Stopping upgrade batch.")
                break
        except Exception as e:
            logger.error(f"Failed to upgrade answers for paper {paper.title}: {str(e)}")
        finally:
            if cache_name:
                await gemini.delete_context_cache(cache_name, client)
            if file_name:
                await gemini.delete_file(file_name, client)
            await redis_client.delete(lock_key)

async def start_background_upgrade_task(interval_seconds: int):
    logger.info("Background upgrade task scheduled.")
    await asyncio.sleep(300) # wait 5 mins on boot
    
    while True:
        try:
            await asyncio.wait_for(run_upgrade_batch(), timeout=2700)
        except asyncio.TimeoutError:
            logger.error("Background upgrade batch timed out after 45 minutes.")
        except Exception as e:
            logger.error(f"Unexpected error in background upgrade task: {e}")
        
        await asyncio.sleep(interval_seconds) # wait 6 hrs for next run
