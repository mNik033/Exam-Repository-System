import logging
import asyncio
import numpy as np
import random
import re
import time

from collections import deque
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from typing import Callable, Any, Coroutine

from config import settings

logger = logging.getLogger(__name__)

class  GeminiAPIError(Exception):
    pass

class DailyQuotaExhaustedError(GeminiAPIError):
    pass

class RetryExhaustedError(GeminiAPIError):
    pass

# ── Rate Limiting ──────────────────────────────────────────────────

class SlidingWindowRateLimiter:
    def __init__(self, rpm: int, window_seconds: float = 60.0):
        self.rpm = rpm
        self.window = window_seconds
        self.timestamps = deque()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        while True:
            async with self._lock:
                now = time.monotonic()
                while self.timestamps and (now - self.timestamps[0]) >= self.window:
                    self.timestamps.popleft()

                if len(self.timestamps) < self.rpm:
                    self.timestamps.append(now)
                    return

                wait_time = (self.timestamps[0] + self.window) - now
            
            logger.info("Rate limit reached (%d RPM). Waiting %.1fs...", self.rpm, wait_time)
            await asyncio.sleep(wait_time + 0.1)
            
    def has_capacity(self) -> bool:
        now = time.monotonic()
        while self.timestamps and (now - self.timestamps[0]) >= self.window:
            self.timestamps.popleft()
        return len(self.timestamps) < self.rpm

    def next_available_at(self) -> float:
        if self.has_capacity():
            return time.monotonic()
        return self.timestamps[0] + self.window


# ── Module Configuration ──────────────────────────────────────────────

client = genai.Client(api_key=settings.GEMINI_API_KEY)
GEMINI_MODEL = "gemini-3.1-flash-lite"
EMBEDDINGS_MODEL = "gemini-embedding-001"

rate_limiter = SlidingWindowRateLimiter(rpm=15)

# ── Prompt Templates ──────────────────────────────────────────────────

PAPER_EXTRACTION_PROMPT = (
    "Extract details from the exam paper exactly as they appear. "
    "Return a JSON output containing the following keys: 'course', 'session', "
    "'sessionYear', 'examType', and 'questions'. For each question, include its "
    "exact text and a specific topic tag. Do not answer the questions in this phase.\n\n"
    "Notes: If the paper is unreadable, not a valid exam paper, or any field is "
    "invalid after normalization, return a JSON object where all fields "
    "('course', 'session', 'sessionYear', 'examType', and 'questions') have a value of -1."
)

ANSWER_GENERATION_PROMPT = (
    "Given the provided exam paper image and the specific question text, generate "
    "an exceptionally detailed and comprehensive pedagogical answer for this exact "
    "question. Analysis must focus heavily on clarity, structure, and correctness.\n\n"
    "Specific Question: {ques_text}"
)


# ── Pydantic Schemas (Structured Output) ──────────────────────────────

class CourseExtraction(BaseModel):
    code: str = Field(
        description=(
            "The normalised course code containing two parts: a string prefix and a "
            "number, with no hyphen or space between them. Normalise any variation "
            "(e.g., 'CS 306', 'CS-306') to the correct value (e.g., 'CSC306')."
        )
    )
    name: str = Field(description="Course name, e.g., 'Computer Networks'")

class QuestionExtraction(BaseModel):
    question: str = Field(
        description="The question text, captured exactly as it appears in the exam paper."
    )
    tag: str = Field(
        description=(
            "A single, specific tag that accurately identifies the core concept, "
            "technique, model, algorithm, or sub-topic tested by the question."
        )
    )

class PaperExtraction(BaseModel):
    course: CourseExtraction
    session: str = Field(
        description=(
            "Must be one of 'Winter', 'Summer', or 'Monsoon'."
            "Normalize any variation (e.g., 'winter session', 'SUMMER-23')."
        )
    )
    sessionYear: str = Field(
        description="Academic session string (e.g., '2022-23', '2023-24')."
    )
    examType: str = Field(
        description=(
            "Must exactly match one of 'Midsem', 'Endsem', 'Quiz', or 'Assignment'."
            "Normalize any variation (e.g., 'Mid SEMESTER')."
        )
    )
    questions: list[QuestionExtraction]

class AnswerExtraction(BaseModel):
    answer: str = Field(
        description=(
            "Generate an exceptionally detailed and comprehensive answer, suitable for "
            "a student aiming for deep understanding. Use markdown formatting: bullet "
            "points, numbered lists, math formulas (LaTeX with markdown), and logical "
            "headings/subheadings (### Heading) to structure the answer."
        )
    )


# ── File Management ──────────────────────────────────────────────────

async def upload_file(file_path: str):
    logger.info("Uploading file to Gemini: %s", file_path)
    upload_result = await client.aio.files.upload(file=file_path)
    logger.info("File uploaded — URI: %s, name: %s", upload_result.uri, upload_result.name)
    return upload_result

async def delete_file(file_name: str) -> None:
    try:
        await client.aio.files.delete(name=file_name)
        logger.info("Deleted Gemini file: %s", file_name)
    except Exception as e:
        logger.error("Failed to delete Gemini file %s: %s", file_name, e)


# ── Context Caching ──────────────────────────────────────────────────

async def create_context_cache(file_uri: str, mime_type: str) -> str | None:
    try:
        logger.info("Creating Context Cache for %s ...", file_uri)
        cache = await client.aio.caches.create(
            model=f"models/{GEMINI_MODEL}",
            config=types.CreateCachedContentConfig(
                contents=[
                    types.Content(
                        role="user",
                        parts=[types.Part.from_uri(file_uri=file_uri, mime_type=mime_type)],
                    )
                ],
                ttl="900s",
            ),
        )
        logger.info("Context Cache created: %s", cache.name)
        return cache.name
    except Exception as e:
        logger.warning("Failed to create Context Cache, fallback triggered: %s", e)
        return None

async def delete_context_cache(cache_name: str) -> None:
    try:
        await client.aio.caches.delete(name=cache_name)
        logger.info("Deleted Context Cache: %s", cache_name)
    except Exception as e:
        logger.error("Failed to delete Context Cache %s: %s", cache_name, e)


# ── Extraction ────────────────────────────────────────────────────────

def _build_file_content(file_uri: str, mime_type: str) -> types.Content:
    return types.Content(
        parts=[types.Part.from_uri(file_uri=file_uri, mime_type=mime_type)]
    )

async def extract_paper_data(
    file_uri: str, mime_type: str, cache_name: str | None = None
) -> PaperExtraction:
    logger.info("Extracting paper metadata and questions ...")

    contents: list = []
    if not cache_name:
        contents.append(_build_file_content(file_uri, mime_type))
    contents.append(PAPER_EXTRACTION_PROMPT)

    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=PaperExtraction,
        temperature=0.2,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True)
    )
    if cache_name:
        config.cached_content = cache_name

    response = await _call_with_retry(
        client.aio.models.generate_content,
        rate_limiter,
        model=GEMINI_MODEL,
        contents=contents,
        config=config
    )

    if response.parsed is None:
        raise ValueError("Gemini returned an unparseable or invalid extraction response.")

    logger.info(
        "Extraction complete — course: %s, questions: %d",
        response.parsed.course.code,
        len(response.parsed.questions),
    )
    return response.parsed


# ── Embedding & Semantic Search ──────────────────────────────────────

async def generate_embeddings(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    try:
        logger.info("Generating vector embeddings for %d texts...", len(texts))
        response = await client.aio.models.embed_content(
            model=EMBEDDINGS_MODEL,
            contents=texts,
            config=types.EmbedContentConfig(output_dimensionality=768),
        )
        if not response.embeddings:
            logger.warning("No embeddings returned via API")
            return []
        return [emb.values for emb in response.embeddings]
    except Exception as e:
        logger.error("Failed to generate embeddings: %s", e)
        return []

def cosine_similarity(a: list[float], b: list[float]) -> float:
    a_arr = np.array(a)
    b_arr = np.array(b)
    norm_a = np.linalg.norm(a_arr)
    norm_b = np.linalg.norm(b_arr)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a_arr, b_arr) / (norm_a * norm_b))


# ── Retry and Backoff ────────────────────────────────────────────────

MAX_RETRIES = 5
BASE_DELAY = 2.0 # seconds

def _classify_error(exception: Exception) -> str:
    error_msg = str(exception)

    if "503" in error_msg:
        return "transient_503"

    if "429" in error_msg:
        if "GenerateRequestsPerDayPerProjectPerModel" in error_msg:
            return "daily_exhausted"
        if "GenerateRequestsPerMinutePerProjectPerModel" in error_msg:
            return "transient_rpm"
        return "transient_rpm"

    return "fatal"

def _parse_retry_delay(exception: Exception) -> float | None:
    match = re.search(r"retryDelay.*?(\d+(?:\.\d+)?)s", str(exception))
    return float(match.group(1)) if match else None
    
async def _call_with_retry(
    api_call_fn: Callable[..., Coroutine[Any, Any, Any]],
    limiter: SlidingWindowRateLimiter,
    *args: Any,
    **kwargs: Any
) -> Any:
    for attempt in range(1, MAX_RETRIES + 1):
        await limiter.acquire()
        try:
            return await api_call_fn(*args, **kwargs)
        except Exception as e:
            classification = _classify_error(e)

            if classification == "daily_exhausted":
                raise DailyQuotaExhaustedError(f"Daily quota exhausted: {e}") from e

            if classification == "fatal":
                raise

            if attempt == MAX_RETRIES:
                raise RetryExhaustedError(f"Failed after {MAX_RETRIES} attempts: {e}") from e

            wait = BASE_DELAY * (2 ** (attempt - 1))

            if classification == "transient_rpm":
                parsed = _parse_retry_delay(e)
                if parsed:
                    wait = max(wait, parsed)

            wait += random.uniform(0.0, 1.0)

            logger.warning("%s on attempt %d/%d. Waiting %.1fs...", classification, attempt, MAX_RETRIES, wait)
            await asyncio.sleep(wait)


# ── Answer Generation ─────────────────────────────────────────────────

async def generate_single_answer(
    ques_text: str,
    file_uri: str,
    mime_type: str,
    cache_name: str | None = None,
    semaphore: asyncio.Semaphore | None = None,
) -> str:
    sem = semaphore if semaphore else asyncio.Semaphore(1)

    async with sem:
        logger.info("Generating answer for: %.60s ...", ques_text)

        contents: list = []
        if not cache_name:
            contents.append(_build_file_content(file_uri, mime_type))
        contents.append(ANSWER_GENERATION_PROMPT.format(ques_text=ques_text))

        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=AnswerExtraction,
            temperature=0.2,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True)
        )
        if cache_name:
            config.cached_content = cache_name

        try:
            response = await _call_with_retry(
                client.aio.models.generate_content,
                rate_limiter,
                model=GEMINI_MODEL,
                contents=contents,
                config=config
            )

            if response.parsed and response.parsed.answer:
                return response.parsed.answer

            return "Answer generation succeeded but output schema was empty"
        except Exception as e:
            logger.error("API error generating answer for '%.30s...': %s", ques_text, e)
            raise

async def generate_answers_parallel(
    ques_texts: list[str],
    file_uri: str,
    mime_type: str,
    cache_name: str | None = None,
    max_concurrent: int = 1,
) -> tuple[list[str | None], list[int]]:
    if not ques_texts:
        return [], []

    logger.info(
        "Generating answers for %d questions (concurrency: %d) ...",
        len(ques_texts),
        max_concurrent,
    )

    semaphore = asyncio.Semaphore(max_concurrent)
    tasks = [
        generate_single_answer(
            ques_text=ques_text,
            file_uri=file_uri,
            mime_type=mime_type,
            cache_name=cache_name,
            semaphore=semaphore,
        )
        for ques_text in ques_texts
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    answers: list[str | None] = []
    failed_indices: list[int] = []

    for i, result in enumerate(results):
        if isinstance(result, Exception):
            answers.append(None)
            failed_indices.append(i)
        else:
            answers.append(result)

    succeeded = sum(1 for a in answers if a is not None)
    logger.info("Answer generation complete — %d/%d succeeded", succeeded, len(ques_texts))

    return answers, failed_indices
