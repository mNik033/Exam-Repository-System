import logging
import asyncio
import numpy as np
import random
import re
import time

from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from google import genai
from google.genai import types
from pydantic import BaseModel, Field, model_validator, field_validator
from typing import Callable, Any, Coroutine

from config import settings
from services.metrics import (
    api_keys_available, api_key_exhaustion_total,
    gemini_api_duration_seconds, track_gemini_latency
)

logger = logging.getLogger(__name__)

class GeminiAPIError(Exception):
    pass

class DailyQuotaExhaustedError(GeminiAPIError):
    pass

class RetryExhaustedError(GeminiAPIError):
    pass

class AllKeysExhaustedError(GeminiAPIError):
    pass

# ── Rate Limiting and API Key Pool ──────────────────────────────────────────────────

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


@dataclass
class ApiContext:
    api_key: str
    client: genai.Client
    rate_limiter: SlidingWindowRateLimiter

class ApiKeyPool:
    def __init__(self, api_keys: list[str], rpm_per_key: int = 15):
        self.contexts = [
            ApiContext(
                api_key=key, 
                client=genai.Client(api_key=key),
                rate_limiter=SlidingWindowRateLimiter(rpm=rpm_per_key)
            )
            for key in api_keys
        ]

    def _count_available_keys(self):
        now = time.monotonic()
        return sum(1 for ctx in self.contexts
                if not ctx.rate_limiter.timestamps 
                or ctx.rate_limiter.timestamps[-1] <= now)

    def acquire(self) -> ApiContext:
        def _last_used(entry: ApiContext) -> float:
            if not entry.rate_limiter.timestamps:
                return 0.0
            return entry.rate_limiter.timestamps[-1]
        
        best = min(self.contexts, key=_last_used)
        # the "most rested" key is in the future -> all keys exhausted
        if best.rate_limiter.timestamps and best.rate_limiter.timestamps[-1] > time.monotonic():
            raise AllKeysExhaustedError("All API keys are currently exhausted")
        return best
    
    def mark_exhausted(self, ctx: ApiContext):
        # Gemini request per day quotas reset at midnight Pacific time
        # which is equivalent to 8 AM UTC
        now = datetime.now(timezone.utc)
        target = now.replace(hour=8, minute=0, second=0, microsecond=0)
        if now >= target:
            target += timedelta(days=1)
        wait_seconds = (target - now).total_seconds()

        ctx.rate_limiter.timestamps.append(time.monotonic() + wait_seconds)
        api_key_exhaustion_total.inc()


# ── Module Configuration ──────────────────────────────────────────────

@dataclass
class GeminiModelConfig:
    name: str
    pool: ApiKeyPool

ANSWER_MODELS = {
    1: GeminiModelConfig(
        name="gemini-3.5-flash-lite",
        pool=ApiKeyPool(api_keys=settings.gemini_api_key_list, rpm_per_key=15)
    ),
    2: GeminiModelConfig(
        name="gemini-3.6-flash",
        pool=ApiKeyPool(api_keys=settings.gemini_api_key_list, rpm_per_key=5)
    )
}
EMBEDDINGS_MODEL = "gemini-embedding-001"

api_keys_available.set_function(ANSWER_MODELS[1].pool._count_available_keys)

# ── Prompt Templates ──────────────────────────────────────────────────

PAPER_EXTRACTION_PROMPT = (
    "Extract details from the exam paper exactly as they appear. "
    "Return a JSON output containing the following keys: 'course', 'session', "
    "'sessionYear', 'examType', and 'questions'. For each question, include its "
    "exact text and a specific topic tag. Do not answer the questions in this phase.\n\n"
    "Extract every sub-part (e.g., 1(a), 1(b), 2(i), 2(ii)) as an individual, separate item in the output. "
    "Do NOT combine or group sub-parts together into a single question entry.\n\n"
    "Notes: If the paper is unreadable, not a valid exam paper, or any field is "
    "invalid after normalization, return a JSON object where all fields "
    "('course', 'session', 'sessionYear', 'examType', and 'questions') have a value of -1."
)

ANSWER_GENERATION_PROMPT = (
    "Given the provided exam paper image and the specific question text, generate "
    "an exceptionally detailed and comprehensive pedagogical answer for this exact "
    "question. Analysis must focus heavily on clarity, structure, and correctness.\n\n"
    "- Use step-by-step reasoning for derivations or numerical problems.\n"
    "- Describe diagrams or visual aids in text if they would help explain the concept.\n"
    "- Explicitly cite relevant theorems or formulas by name before applying them.\n\n"
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
    q_no: str = Field(
        description=(
            "The question number or sequence label exactly as written on the paper (e.g., '1', '1(a)', '2.b', '3(ii)')."
        )
    )
    question: str = Field(
        description=(
            "The question text, captured exactly as it appears in the exam paper. "
            "Do not include the leading question number or prefix label (e.g., '1', '1(a)') in this field. "
            "Strip trailing mark indicators (e.g., '(5 marks)', '[5M]', '(2+3)')."
        )
    )
    tag: str = Field(
        description=(
            "A single, specific tag that accurately identifies the core concept, "
            "technique, model, algorithm, or sub-topic tested by the question. "
            "Use Title Case formatting (e.g., 'Binary Search Trees')."
        )
    )

    @field_validator("q_no", mode="before")
    @classmethod
    def clean_q_no(cls, v: str) -> str:
        if isinstance(v, str):
            return v.strip().rstrip(".:- ")
        return v

class PaperExtraction(BaseModel):
    course: CourseExtraction
    session: str = Field(
        description=(
            "Must be one of 'Winter', 'Summer', or 'Monsoon'."
            "Normalize any variation (e.g., 'winter session', 'SUMMER-23')."
        )
    )
    sessionYear: str = Field(
        description=(
            "Academic session string formatted strictly as 'YYYY-YY' (e.g., '2022-23'). "
            "Normalize formats like '2022-2023' to '2022-23'. "
            "If only a single year is mentioned (e.g., '2023'), assume it is the starting year "
            "and output '2023-24'."
        )
    )
    examType: str = Field(
        description=(
            "Must exactly match one of 'Midsem', 'Endsem', 'Quiz', or 'Assignment'."
            "Normalize any variation (e.g., 'Mid SEMESTER')."
        )
    )
    suffix: int | None = Field(
        default=None,
        description=(
            "The numerical identifier if the exam is a Quiz or Assignment "
            "(must be 1 or 2; e.g., for 'Quiz 2', this is 2). "
            "For 'Midsem' or 'Endsem', this MUST always be None."
        )
    )
    questions: list[QuestionExtraction]

    @model_validator(mode="after")
    def enforce_suffix_rules(self):
        if self.examType in ["Midsem", "Endsem"]:
            self.suffix = None
        elif self.examType in ["Quiz", "Assignment"]:
            if self.suffix not in (1, 2):
                self.suffix = 1
        return self

class AnswerExtraction(BaseModel):
    answer: str = Field(
        description=(
            "Generate an exceptionally detailed and comprehensive answer, suitable for "
            "a student aiming for deep understanding. Start with a concise one-liner summary. "
            "Use markdown formatting: bold key terms on first mention, use bullet "
            "points/numbered lists, and use logical headings (### Heading) to separate sections. "
            "CRITICAL: For math formulas, you MUST strictly use $ for inline math (e.g. $x^2$) "
            "and $$ for block math. Do NOT use \\( or \\[."
        )
    )

    @model_validator(mode="after")
    def sanitize_latex(self):
        # JSON parsing corrupts raw LaTeX commands (\frac -> [Form Feed]rac) making them unrenderable.
        # Restore double backslashes for frontend KaTeX renderer.
        replacements = {
            "\frac": "\\frac",
            "\bin": "\\bin",
            "\begin": "\\begin",
            "\big": "\\big",
            "\bar": "\\bar",
            "\text": "\\text",
            "\times": "\\times",
            "\theta": "\\theta",
            "\tau": "\\tau",
            "\tan": "\\tan",
            "\tag": "\\tag",
            "\tilde": "\\tilde",
            "\not": "\\not",
            "\neq": "\\neq",
            "\new": "\\new",
            "\nabla": "\\nabla",
            "\right": "\\right",
            "\rho": "\\rho",
        }
        for broken, fixed in replacements.items():
            self.answer = self.answer.replace(broken, fixed)
        return self


# ── File Management ──────────────────────────────────────────────────

@track_gemini_latency("upload_file")
async def upload_file(file_path: str, client: genai.Client):
    logger.info("Uploading file to Gemini: %s", file_path)
    upload_result = await client.aio.files.upload(file=file_path)
    logger.info("File uploaded — URI: %s, name: %s", upload_result.uri, upload_result.name)
    return upload_result

async def delete_file(file_name: str, client: genai.Client) -> None:
    try:
        await client.aio.files.delete(name=file_name)
        logger.info("Deleted Gemini file: %s", file_name)
    except Exception as e:
        logger.error("Failed to delete Gemini file %s: %s", file_name, e)


# ── Context Caching ──────────────────────────────────────────────────

@track_gemini_latency("create_cache")
async def create_context_cache(
    file_uri: str, mime_type: str, client: genai.Client, target_model: int = 1
) -> str | None:
    try:
        logger.info("Creating Context Cache for %s ...", file_uri)
        cache = await client.aio.caches.create(
            model=f"models/{ANSWER_MODELS[target_model].name}",
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

async def delete_context_cache(cache_name: str, client: genai.Client) -> None:
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

@track_gemini_latency("extract_paper_data")
async def extract_paper_data(
    file_uri: str,
    mime_type: str,
    client: genai.Client,
    limiter: SlidingWindowRateLimiter,
    cache_name: str | None = None,
    target_model: int = 1,
) -> PaperExtraction:
    logger.info("Extracting paper metadata and questions ...")

    contents: list = []
    if not cache_name:
        contents.append(_build_file_content(file_uri, mime_type))
    contents.append(PAPER_EXTRACTION_PROMPT)

    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=PaperExtraction,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True)
    )
    if cache_name:
        config.cached_content = cache_name

    response = await _call_with_retry(
        client.aio.models.generate_content,
        limiter,
        model=ANSWER_MODELS[target_model].name,
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

async def generate_embeddings(texts: list[str], client: genai.Client) -> list[list[float]]:
    if not texts:
        return []
    
    logger.info("Generating vector embeddings for %d texts...", len(texts))
    response = await _call_with_retry(
        client.aio.models.embed_content,
        None,
        model=EMBEDDINGS_MODEL,
        contents=texts,
        config=types.EmbedContentConfig(output_dimensionality=768),
    )

    if not response.embeddings:
        logger.warning("No embeddings returned via API")
        return []
    return [emb.values for emb in response.embeddings]

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
    limiter: SlidingWindowRateLimiter | None = None,
    *args: Any,
    **kwargs: Any
) -> Any:
    for attempt in range(1, MAX_RETRIES + 1):
        if limiter:
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

            if classification == "transient_rpm" and (parsed := _parse_retry_delay(e)):
                wait = parsed
            else:
                wait = BASE_DELAY * (2 ** (attempt - 1))

            wait += random.uniform(0.0, 1.0)

            logger.warning("%s on attempt %d/%d. Waiting %.1fs...", classification, attempt, MAX_RETRIES, wait)
            await asyncio.sleep(wait)


# ── Answer Generation ─────────────────────────────────────────────────

async def generate_single_answer(
    ques_text: str,
    file_uri: str,
    mime_type: str,
    client: genai.Client,
    limiter: SlidingWindowRateLimiter,
    cache_name: str | None = None,
    target_model: int = 1,
) -> str:
    logger.info("Generating answer for: %.60s ...", ques_text)

    contents: list = []
    if not cache_name:
        contents.append(_build_file_content(file_uri, mime_type))
    contents.append(ANSWER_GENERATION_PROMPT.format(ques_text=ques_text))

    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=AnswerExtraction,
        thinking_config=types.ThinkingConfig(thinking_level="high"),
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True)
    )

    if cache_name:
        config.cached_content = cache_name

    try:
        response = await _call_with_retry(
            client.aio.models.generate_content,
            limiter,
            model=ANSWER_MODELS[target_model].name,
            contents=contents,
            config=config
        )

        if response.parsed and response.parsed.answer:
            return response.parsed.answer

        raise ValueError("Answer generation succeeded but output schema was empty")
    except Exception as e:
        logger.error("API error generating answer for '%.30s...': %s", ques_text, e)
        raise

@track_gemini_latency("generate_answers")
async def generate_answers_parallel(
    ques_texts: list[str],
    file_uri: str,
    mime_type: str,
    client: genai.Client,
    limiter: SlidingWindowRateLimiter,
    cache_name: str | None = None,
    target_model: int = 1,
) -> tuple[list[str | None], list[int]]:
    if not ques_texts:
        return [], []

    logger.info("Generating answers for %d questions...", len(ques_texts))

    tasks = [
        generate_single_answer(
            ques_text=ques_text,
            file_uri=file_uri,
            mime_type=mime_type,
            client=client,
            limiter=limiter,
            cache_name=cache_name,
            target_model=target_model,
        )
        for ques_text in ques_texts
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    answers: list[str | None] = []
    failed_indices: list[int] = []

    for i, result in enumerate(results):
        if isinstance(result, DailyQuotaExhaustedError):
            raise result
        if isinstance(result, Exception):
            answers.append(None)
            failed_indices.append(i)
        else:
            answers.append(result)

    succeeded = sum(1 for a in answers if a is not None)
    logger.info("Answer generation complete — %d/%d succeeded", succeeded, len(ques_texts))

    return answers, failed_indices
