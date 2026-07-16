from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    MONGO_URI: str
    DB_NAME: str
    JWT_SECRET: str
    PORT: int = 8001
    COURSES_JSON_PATH: str
    GEMINI_API_KEYS: str
    RAZORPAY_KEY: str
    RAZORPAY_SECRET: str
    RAZORPAY_WEBHOOK_SECRET: str
    UNLOCK_COST: int = 5
    PROMETHEUS_TOKEN: str | None = None
    INSTITUTE_DOMAIN: str | None = None
    ENVIRONMENT: str = "prod"
    ALLOWED_ORIGINS: str = ""

    # Redis Configuration
    REDIS_URL: str
    REDIS_PASSWORD: str
    REDIS_PREFIX: str = "examrepo:"

    # Cloudflare R2 Storage
    R2_ACCOUNT_ID: str | None = None
    R2_BUCKET_NAME: str | None = None
    R2_ACCESS_KEY_ID: str | None = None
    R2_SECRET_ACCESS_KEY: str | None = None

    # SMTP Email Configuration
    SMTP_EMAIL: str
    SMTP_PASSWORD: str

    @property
    def gemini_api_key_list(self) -> list[str]:
        return [k.strip() for k in self.GEMINI_API_KEYS.split(",") if k.strip()]

    @property
    def allowed_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()