import time
import functools
import inspect
from prometheus_client import Counter, Histogram, Gauge, Info

# ── Paper Processing ──────────────────────────────────────────────

paper_processing_total = Counter(
    "paper_processing_total",
    "Total paper processing attempts",
    labelnames=["status", "failure_reason"],
)

paper_processing_duration = Histogram(
    "paper_processing_duration_seconds",
    "Time taken to process a paper end-to-end",
    buckets=[30, 60, 90, 120, 180, 240, 300, 600],
)

papers_solved_total = Counter(
    "papers_solved_total",
    "Total number of successfully solved exam papers",
    labelnames=["model"],
)

paper_duplicate_total = Counter(
    "paper_duplicate_total",
    "Papers rejected as duplicates",
)

# ── Gemini API Key Pool ─────────────────────────────────────────

api_keys_available = Gauge(
    "gemini_api_keys_available",
    "Number of API keys currently available (not exhausted)",
)

api_key_exhaustion_total = Counter(
    "gemini_api_key_exhaustion_total",
    "Total number of times an API key hit its daily quota",
)

# ── Gemini API Operation Latencies ────────────────────────────────

gemini_api_duration_seconds = Histogram(
    "gemini_api_duration_seconds",
    "Duration of specific Gemini API operations",
    labelnames=["operation", "model"], # "upload_file", "create_cache", "extract_paper", "generate_answer", "generate_embeddings"
    buckets=[0.5, 1, 2, 5, 10, 30, 60, 120],
)

# ── Active Tasks (Concurrency) ────────────────────────────────────

active_paper_processing_tasks = Gauge(
    "active_paper_processing_tasks",
    "Number of papers currently being processed concurrently",
)

# ── Security & Rate Limits ────────────────────────────────────────

rate_limit_rejections_total = Counter(
    "rate_limit_rejections_total",
    "Total requests blocked by local rate limits",
    labelnames=["endpoint"], # e.g. "/api/send-otp", "/api/signup", "/api/uploadPaper"
)

# ── Upload Rejections & Failures ──────────────────────────────────

paper_upload_validation_failures_total = Counter(
    "paper_upload_validation_failures_total",
    "Paper uploads rejected during validation before background processing",
    labelnames=["reason"], # "size_limit", "invalid_format", "already_processing", "already_completed", "already_rejected"
)

# ── Questions ─────────────────────────────────────────────────────

questions_reused_total = Counter(
    "questions_reused_total",
    "Questions matched via deduplication (exact or cosine)",
    labelnames=["match_type"],  # "exact" or "cosine"
)

questions_created_total = Counter(
    "questions_created_total",
    "New questions created (no match found)",
)

# ── Auth / OTP ────────────────────────────────────────────────────

otp_sent_total = Counter(
    "otp_sent_total",
    "Total OTP emails dispatched",
    labelnames=["status"],  # "success" or "failed"
)

# ── Database Health (MongoDB) ─────────────────────────────────────

db_operations_total = Counter(
    "db_operations_total",
    "Total database operations executed",
    labelnames=["collection", "operation", "status"], # e.g. ["papers", "insert", "success"]
)

# ── Credits ───────────────────────────────────────────────────────

credits_spent_total = Counter(
    "credits_spent_total",
    "Total credits spent by users",
    labelnames=["action"], # e.g., ["unlock_answer"]
)

credits_awarded_total = Counter(
    "credits_awarded_total",
    "Total credits awarded to users (free/earned)",
    labelnames=["reason"], # e.g., ["signup", "referral", "paper_processed"]
)

answers_unlocked_total = Counter(
    "answers_unlocked_total",
    "Number of answers unlocked by users",
)

course_browsed_total = Counter(
    "course_browsed_total",
    "Total times a course was browsed",
    labelnames=["course_code"],
)

user_referrals_total = Counter(
    "user_referrals_total",
    "Total number of successful signups using a referral code",
)

# ── General ───────────────────────────────────────────────────────

app_info = Info(
    "examrepo",
    "Application metadata",
)

def track_gemini_latency(operation: str):
    """Decorator that measures Gemini API call duration."""
    def decorator(fn):
        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            bound_args = inspect.signature(fn).bind(*args, **kwargs)
            bound_args.apply_defaults()
            target_model = bound_args.arguments.get("target_model")
            
            if target_model is not None:
                from services.gemini import ANSWER_MODELS
                model = ANSWER_MODELS[target_model].name if target_model in ANSWER_MODELS else "unknown"
            else:
                model = "none"
            
            start = time.time()
            try:
                return await fn(*args, **kwargs)
            finally:
                gemini_api_duration_seconds.labels(
                    operation=operation, model=model
                ).observe(time.time() - start)
        return wrapper
    return decorator