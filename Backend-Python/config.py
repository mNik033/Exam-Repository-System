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

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()