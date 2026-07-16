# Exam Repository System

A robust and scalable platform for uploading, sharing, and discovering university exam papers. The system uses LLMs to extract and structure questions from uploaded PDFs, generate detailed answers, and apply lexical and semantic deduplication to avoid re-generating answers for questions. Users unlock these answers using credits, which can be earned by uploading past papers or purchased directly.

> The original Node.js/Express backend (`/Backend`) has been deprecated. All active development targets the Python/FastAPI backend in `/Backend-Python`, which includes significant architectural improvements around search, concurrency, storage, and observability.

## How It Works (The AI Pipeline)

```
Upload PDF → Gemini extracts questions & metadata
                 │
                 ▼
         Batch-embed all questions (text embedding model)
                 │
                 ▼
         For each question:
           ├─ Tier 1: Exact match via MongoDB B-Tree Index   → reuse existing
           └─ Tier 2: Vector similarity via MongoDB ENN      → reuse if ≥ 0.85
           └─ No match → generate answer (fast, efficient model)
                 │
                 ▼
         Save paper, link questions, credit uploader, notify via SSE
                 │
                 ▼
         (Async Background Loop)
         Eventual upgrade of answers using a higher-tier model
```

Questions are always scoped to a course; the same question text in different courses will produce independent answers. For example, a generic question like "Write a function to reverse a string" will generate a Java-specific implementation (`StringBuilder`) for a Java programming course, but a C++ implementation (`std::reverse`) for a C++ course.

## Project Structure

The backend follows a **Controller → Service → Repository** pattern to keep HTTP routing and data access layers "dumb." Routers strictly handle request validation and responses, repositories manage raw database queries, and services contain the core business logic and external API integrations.

```
Backend-Python/
├── config.py               # Pydantic Settings, reads .env
├── database.py             # Motor client, Redis client, collection refs
├── security.py             # JWT, bcrypt, get_current_user dependency
├── main.py                 # FastAPI app, lifespan, CORS, router mounts
│
├── routers/                # Dumb HTTP routing (validation & serializing only)
├── services/               # Core business logic (Gemini, vector search, storage, SSE)
├── repositories/           # Dumb data access layer (Motor queries only)
├── tasks/                  # Background workers (paper processing, answer upgrading)
├── models/                 # Pydantic domain models
└── schemas/                # Request/response payloads
```

### Key Infrastructure

| Concern | Implementation |
|---|---|
| Search | MongoDB Atlas Search (Apache Lucene) for text; `$vectorSearch` (ENN) for semantic similarity |
| AI rate limiting | Multi-API key pool with a custom `SlidingWindowRateLimiter` and automatic failover |
| File deduplication | BLAKE3 hash as primary key in `upload_registry`, with distributed Redis locks (`SET NX EX`) |
| Real-time notifications | Redis Pub/Sub → Server-Sent Events per user channel |
| Concurrency | Distributed locking via Redis (`SET NX EX`) to coordinate background tasks and prevent race conditions |
| Background processing | FastAPI lifespan asyncio tasks executing periodic background workers (e.g., answer upgrades) |
| File storage | Abstracted `StorageClient` interface (swappable between local disk and Cloudflare R2) |
| Rate limiting | `fastapi-guard` with global and per-route overrides |
| Observability | Prometheus metrics endpoint, compatible with multiprocess workers |
| Payments | Razorpay with server-side webhook verification (HMAC-SHA256) and idempotent processing |

### Background Processing

Paper uploads return `202 Accepted` immediately. The actual extraction, embedding, deduplication, and answer generation happen asynchronously in a hybrid queue model:
- **Serial Paper Processing:** Entire uploaded papers are processed sequentially in a serial queue. This helps maintain data consistency and prevents race conditions (such as identical simultaneous uploads). The system uploads the PDF to Gemini's Files API once, creates a reusable context cache, and extracts metadata. If a duplicate paper is found in the database during this sequential check, processing is immediately aborted to save API costs, linking the uploader to the existing paper instead.
- **Parallel Question Generation:** The questions *within* a paper are processed concurrently using `asyncio.gather`. This maximizes the throughput of the Gemini API by making concurrent API calls under the rate-limiting queue rather than waiting for each answer sequentially.

A separate background task handles answer upgrading for previously processed papers. Both task types acquire distributed Redis locks before processing to prevent duplicate work across multiple workers.

### Horizontal Scalability

The system is designed to scale horizontally across multiple instances without race conditions or state fragmentation:
- **Stateless Authentication:** All auth is handled via JWTs; there are no in-memory sessions.
- **Distributed Locks:** Redis `SET NX EX` guarantees that if a load balancer routes identical simultaneous uploads to different worker nodes, only one node processes the file.
- **Redis Pub/Sub for SSE:** If a user is connected to Node A, but their file finishes processing on Node B, Node B publishes the notification to Redis, and Node A pushes it down the Server-Sent Events stream to the user.
- **Atomic State Writes:** State updates (like adjusting credits or linking question IDs) leverage MongoDB's native atomic operators (`$inc`, `$push`) instead of read-modify-write loops, preventing write conflicts between backend instances.

### Robustness & Fault Tolerance

The system is built to handle edge cases, API limits, and unexpected crashes gracefully:
- **API Key Pooling & Failover:** The `ApiKeyPool` uses a "most rested" load-balancing algorithm, routing each request to the Gemini API key that has been idle the longest. If a key hits its daily request quota (HTTP 429 Resource Exhausted), it is automatically suspended until Google's [midnight Pacific time quota reset](https://ai.google.dev/gemini-api/docs/rate-limits#how-rate-limits-work), and traffic seamlessly fails over to the next available key.
- **Crash Recovery:** Background processing relies on persistent database states. If a server crashes mid-generation or a container is preempted, incomplete tasks are automatically picked up and resumed by the next available worker during its periodic polling cycle.
- **Idempotent Webhooks:** Payment webhooks (Razorpay) and state-modifying operations are fully idempotent. Duplicate network retries from external providers will never result in double-crediting a user or corrupting the database.
- **Exponential Backoff & Jitter:** Transient AI model errors (like `503 Service Unavailable` or Requests Per Minute (RPM) limits) are caught and retried up to 5 times. The logic respects Google's explicit `retryDelay` if provided, otherwise falling back to an exponential backoff strategy with randomized jitter to prevent thundering herd problems.
- **Dual-Tier Model Strategy:** To provide an immediate UX and handle upload bursts without bottlenecking on rate limits, initial answers are generated using a highly efficient model with a large RPM allowance. A periodic background task then utilizes the API key pool to asynchronously upgrade these answers using a more capable, lower-RPM model, ensuring eventual quality without sacrificing immediate responsiveness.
- **Structured Outputs & Normalization:** Passes Pydantic schemas directly to the Gemini API to enforce a strict JSON structure. This also helps the model automatically normalize metadata variations (such as standardizing 'winter session' to 'Winter' or 'Mid SEMESTER' to 'Midsem') before database insertion.

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, Material Tailwind, React Router |
| Backend | Python 3.14, FastAPI, Uvicorn, Pydantic v2 |
| Database | MongoDB (Motor async driver), Atlas Search, Atlas Vector Search |
| Cache / Events | Redis (async) for distributed locks and SSE Pub/Sub |
| AI | Google `google-genai` SDK (Gemini 3.1 Flash Lite / 3.5 Flash, gemini-embedding-001) |
| Storage | Cloudflare R2 (S3-compatible) via `StorageClient` abstraction |
| Auth / Security | PyJWT, Passlib (bcrypt), OTP verification, `fastapi-guard` |
| Payments | Razorpay Python SDK |
| Observability | Prometheus |
| Dependencies | Poetry 2.0 |

## Getting Started

### Prerequisites

- Python 3.13+ and Poetry
- Node.js v18+
- MongoDB Atlas cluster (with Atlas Search and Vector Search indexes configured)
- Redis instance
- One or more Google Gemini API keys

### Setup

```bash
git clone https://github.com/mNik033/Exam-Repository-System.git
cd Exam-Repository-System
```

**Backend:**

```bash
cd Backend-Python
poetry install --no-root
nano .env   # then fill in values
poetry run python seed.py   # seed initial courses
poetry run uvicorn main:app
```

The `.env` file requires the following base configuration (see `config.py` for the full schema including optional R2 and Prometheus settings):

### Environment Variables Reference

| Variable | Description |
|---|---|
| `ENVIRONMENT` | `dev` or `prod`. Disables API docs and enforces stricter security in `prod`. |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins. Defaults to `""` (blocks all). |
| `MONGO_URI` | Connection string for MongoDB. |
| `DB_NAME` | Name of the database to use. |
| `JWT_SECRET` | Secret key for signing JSON Web Tokens. |
| `GEMINI_API_KEYS` | Comma-separated list of Gemini API keys for rate limit pooling. |
| `REDIS_URL` | Redis connection URL. |
| `REDIS_PASSWORD` | Password for the Redis instance. |
| `SMTP_EMAIL` / `PASSWORD` | Credentials for sending transactional emails (e.g., OTP). |
| `RAZORPAY_KEY` / `SECRET` | Keys for the payment gateway. |
| `RAZORPAY_WEBHOOK_SECRET` | Secret for verifying payment webhooks. |

**MongoDB Atlas Indexes:**

You need to create the following indexes in the MongoDB Atlas UI for search functionality to work:

1. **Vector Search Index** on the `questions` collection:
   - Name: `question_embedding_index`
   - JSON Configuration:
     ```json
     {
       "fields": [
         {
           "type": "vector",
           "path": "embedding",
           "numDimensions": 768,
           "similarity": "cosine"
         },
         {
           "type": "filter",
           "path": "course_id"
         }
       ]
     }
     ```

2. **Atlas Search Index** on the `papers` collection:
   - Name: `paper_search_index`
   - JSON Configuration:
     ```json
     {
       "mappings": {
         "dynamic": false,
         "fields": {
           "title": { "type": "string" },
           "tags": { "type": "string" }
         }
       }
     }
     ```

**Frontend:**

First, create a `.env` file in the `Frontend/` directory:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_RAZORPAY_TEST=your_razorpay_key_here
```

Then install and run the development server:

```bash
cd Frontend
npm install
npm run dev
```

## API Documentation

When running in development mode (`ENVIRONMENT=dev`), the interactive API documentation is auto-generated and accessible at:
- **Swagger UI:** `http://localhost:8000/docs`
- **ReDoc:** `http://localhost:8000/redoc`

## Deployment

For production deployment, it is recommended to run the FastAPI application using Uvicorn with multiple workers or behind a process manager like Gunicorn. Since the system is stateless and relies on Redis for distributed locking and Pub/Sub, you can easily scale it horizontally across multiple instances or containers (e.g., using Kubernetes or Cloud Run).

Ensure that your `ENVIRONMENT` environment variable is set to `prod` to disable interactive API documentation and enable stricter security policies.