from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    MONGO_URI: str
    DB_NAME: str
    JWT_SECRET: str
    PORT: int = 8001

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()