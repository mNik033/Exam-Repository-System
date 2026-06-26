import logging
import os
import uuid
import shutil
import asyncio
import mimetypes

from models.question import Question
from repositories import paper_repo, question_repo, user_repo, course_repo
from services import gemini

logger = logging.getLogger(__name__)

SIMILARITY_THRESHOLD = 0.85
MAX_API_CONCURRENCY = 1


# ── Helper Functions ──────────────────────────────────────────────────


def _get_mime_type(file_path: str) -> str:
    mime_type, _ = mimetypes.guess_type(file_path)
    if mime_type:
        return mime_type

    # try to infer from extension if guess_type fails
    ext = file_path.split(".")[-1].lower()
    if ext in ["jpg", "jpeg"]:
        return "image/jpeg"
    elif ext == "png":
        return "image/png"
    elif ext == "pdf":
        return "application/pdf"
    
    return "application/octet-stream"

def _is_extraction_valid(extracted_data) -> bool:
    # validate a readable exam paper with questions
    if not extracted_data:
        return False
    if extracted_data.course.code == "-1":
        return False
    if extracted_data.session == "-1":
        return False
    if not extracted_data.questions:
        return False
    return True

async def _generate_embeddings(question_texts: list[str]) -> list[list[float]]:
    embeddings = await gemini.generate_embeddings(question_texts)
    
    if not embeddings:
        raise Exception("Failed to generate embeddings")

    if len(embeddings) != len(question_texts):
        raise Exception("Mismatch between number of questions and embeddings")
    
    return embeddings

async def _deduplicate_questions(
    course_id: str,
    extracted_questions: list,
    embeddings: list[list[float]],
    course_code: str
) -> tuple[list[str | None], list[dict]]:
    # two tier deduplication against existing questions per course
    # tier 1: exact text match (fast indexed DB lookup)
    # tier 2: cosine similarity against all course questions
    
    question_ids: list[str | None] = []
    new_questions_to_generate: list[dict] = []

    existing_questions = await question_repo.find_by_course(course_id)
    
    for i, q in enumerate(extracted_questions):
        question_text = q.question.strip()

        exact_match = await question_repo.find_exact_match(course_id, question_text)
        if exact_match:
            logger.info("  Q%d: Exact match (id=%s). Reusing.", i + 1, exact_match.id)
            question_ids.append(exact_match.id)
            continue

        best_match = None
        best_sim = 0.0

        for existing_q in existing_questions:
            if not existing_q.embedding:
                continue
            sim = gemini.cosine_similarity(embeddings[i], existing_q.embedding)

            if sim > best_sim:
                best_sim = sim
                best_match = existing_q

        if best_match and best_sim >= SIMILARITY_THRESHOLD:
            logger.info("  Q%d: Similar to existing question (id=%s, sim=%.3f). Reusing.", i + 1, best_match.id, best_sim)
            question_ids.append(best_match.id)
            continue
        
        logger.info("  Q%d: No match (best_sim=%.3f). Queuing for answer generation.", i + 1, best_sim)

        new_questions_to_generate.append({
            "index": i,
            "question_text": question_text,
            "tag": q.tag,
            "embedding": embeddings[i]
        })
        question_ids.append(None)

    logger.info("Dedup complete: %d reused, %d new.", len(question_ids) - len(new_questions_to_generate), len(new_questions_to_generate))

    return question_ids, new_questions_to_generate

async def _move_to_permanent_storage(file_path: str, target_name: str) -> str:
    # move temp upload to permanent storage and return new path
    file_extension = file_path.split(".")[-1]
    perm_filename = f"{target_name}.{file_extension}"
    perm_path = os.path.join("uploads", perm_filename)

    os.makedirs(os.path.dirname(perm_path), exist_ok=True)
    shutil.move(file_path, perm_path)
    logger.info("Moved file to permanent storage: %s", perm_path)
    
    return perm_path

async def _cleanup_assets(
    file_path: str,
    file_name: str | None = None,
    cache_name: str | None = None,
    remove_local: bool = True) -> None:
    # clean up Gemini API assets and local temp files
    if cache_name:
        try:
            await gemini.delete_context_cache(cache_name)
        except Exception as e:
            logger.error("Failed to delete context cache %s: %s", cache_name, e)

    if file_name:
        try:
            await gemini.delete_file(file_name)
        except Exception as e:
            logger.error("Failed to delete Gemini file %s: %s", file_name, e)

    if remove_local and os.path.exists(file_path):
        try:
            os.remove(file_path)
            logger.info("Removed temp file: %s", file_path)
        except Exception as e:
            logger.error("Failed to remove temp file %s: %s", file_path, e)

async def _resolve_course(course_code: str, course_name: str):
    course = await course_repo.get_course_by_code(course_code)
    if course:
        return course

    if course_name:
        logger.info("Course code '%s' not found. Trying name fallback: '%s'", course_code, course_name)
        matches = await course_repo.get_courses_by_name(course_name)
        if matches:
            logger.info("Resolved via name fallback: %s", matches[0].code)
            return matches[0]

    return None


# ── Core Task ─────────────────────────────────────────────────────────


async def process_uploaded_paper_task(file_path: str, user_id: str) -> None:
    logger.info(f"Background task triggered for {file_path} uploaded by user {user_id}")

    file_name = None
    cache_name = None

    try:
        mime_type = _get_mime_type(file_path)
        
        # Step 1. upload to Gemini File API
        logger.info("Step 1. Uploading paper to Gemini...")
        upload_result = await gemini.upload_file(file_path)
        file_uri = upload_result.uri
        file_name = upload_result.name

        # Step 1.5 create Context Cache
        logger.info("Step 1.5: Creating Context Cache...")
        cache_name = await gemini.create_context_cache(file_uri, mime_type)

        # Step 2: extract metadata and questions
        logger.info("Step 2: Extracting paper data...")
        extracted_data = await gemini.extract_paper_data(file_uri, mime_type, cache_name)

        # Step 3: validate extraction
        if not _is_extraction_valid(extracted_data):
            logger.warning("Step 3: Paper rejected (unreadable/invalid).")
            await user_repo.add_notification(
                user_id=user_id,
                message="We couldn't process your uploaded paper. It may be unreadable or not a valid exam paper.",
                type="error"
            )
            await _cleanup_assets(file_path, file_name, cache_name)
            return

        # Step 4: resolve course
        logger.info("Step 4: Resolving course: %s", extracted_data.course.code)
        course = await _resolve_course(extracted_data.course.code, extracted_data.course.name)
        if not course:
            logger.warning("Step 4: Course not found. Rejecting.")
            await user_repo.add_notification(
                user_id=user_id,
                message=f"Paper rejected: we couldn't match '{extracted_data.course.code}' to a supported course.",
                type="error"
            )
            await _cleanup_assets(file_path, file_name, cache_name)
            return

        # Step 5: check duplicate paper
        logger.info("Step 5: Checking for duplicate paper...")
        duplicate_paper_id = await paper_repo.exists_paper(
            course_id=course.id,
            session=extracted_data.session,
            session_year=extracted_data.sessionYear,
            exam_type=extracted_data.examType
        )

        if duplicate_paper_id:
            logger.warning("Step 5: Duplicate paper. Rejecting.")
            await user_repo.add_notification(
                user_id=user_id,
                message=f"Your uploaded paper for {course.code} ({extracted_data.session}, {extracted_data.sessionYear}, {extracted_data.examType}) is already in the database.",
                type="info",
                paper_id=duplicate_paper_id
            )
            await _cleanup_assets(file_path, file_name, cache_name)
            return

        # Step 6: batch-embed question texts
        logger.info("Step 6: Generating embeddings for %d questions...", len(extracted_data.questions))
        question_texts = [q.question for q in extracted_data.questions]
        embeddings = await _generate_embeddings(question_texts)

        # Step 7: two-tier deduplication
        logger.info("Step 7: Running deduplication (threshold=%.2f)...", SIMILARITY_THRESHOLD)
        question_ids, new_questions = await _deduplicate_questions(
            course_id=course.id,
            extracted_questions=extracted_data.questions,
            embeddings=embeddings,
            course_code=course.code
        )

        # Step 8: generate answers for new questions
        if new_questions:
            new_texts = [item["question_text"] for item in new_questions]
            logger.info("Step 8: Generating answers for %d new questions...", len(new_texts))
            answers = await gemini.generate_answers_parallel(
                ques_texts=new_texts,
                file_uri=file_uri,
                mime_type=mime_type,
                cache_name=cache_name,
                max_concurrent=MAX_API_CONCURRENCY
            )

        # Step 9: save new questions to db
        if new_questions:
            logger.info("Step 9: Saving %d new questions...", len(new_questions))
            questions_to_insert = [
                Question(
                    question_text=item["question_text"],
                    answer_text=answers[idx],
                    tag=item["tag"],
                    course_id=course.id,
                    embedding=item["embedding"]
                )
                for idx, item in enumerate(new_questions)
            ]
            inserted_ids = await question_repo.create_questions_bulk(questions_to_insert)

            for idx, item in enumerate(new_questions):
                question_ids[item["index"]] = inserted_ids[idx]

        # Step 10: move file and save paper
        target_name = f"{course.code}_{extracted_data.sessionYear}_{extracted_data.session}_{extracted_data.examType}".replace(" ", "_").replace("/", "-")
        perm_path = await _move_to_permanent_storage(file_path, target_name)
        paper_title = f"[{course.code}] {course.name} - {extracted_data.examType} ({extracted_data.session} {extracted_data.sessionYear})"

        paper_id = await paper_repo.create_paper(
            title=paper_title,
            file_path=perm_path,
            course_id=course.id,
            uploaded_by=user_id,
            session=extracted_data.session,
            session_year=extracted_data.sessionYear,
            exam_type=extracted_data.examType,
            question_ids=question_ids
        )
        logger.info("Paper created: %s (id=%s)", paper_title, paper_id)

        # Step 11: award credits and notify
        logger.info("Step 11: Awarding credits and notifying user...")
        await user_repo.update_credits(user_id, 100)
        await user_repo.add_notification(
            user_id=user_id,
            message=f"Your paper '{paper_title}' has been successfully processed! +100 credits awarded.",
            type="success",
            paper_id=paper_id
        )

        await _cleanup_assets(file_path, file_name, cache_name, False)
        logger.info("Processing complete: %s", paper_title)
    
    except Exception as e:
        logger.error("Paper processing failed: %s", e, exc_info=True)
        try:
            await user_repo.add_notification(
                user_id=user_id,
                message="An error occurred while processing your paper. Please try again later.",
                type="error"
            )
        except Exception as notify_err:
            logger.error("Failed to notify user: %s", notify_err)
        
        await _cleanup_assets(file_path, file_name, cache_name, True)
