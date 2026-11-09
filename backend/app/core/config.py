"""Application configuration loaded from environment variables."""

from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]
DEVELOPMENT_JWT_SECRET = "dev-only-change-me-in-production-7f3c9a1e"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BASE_DIR / ".env", BASE_DIR.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
    )

    app_name: str = "AI Livestock Guardian"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"
    debug: bool = True

    # Database: PostgreSQL in production, SQLite for zero-config local demos/tests.
    database_url: str = f"sqlite:///{(BASE_DIR / 'livestock_guardian.db').as_posix()}"
    db_echo: bool = False

    # Auth
    jwt_secret: str = DEVELOPMENT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 2

    # LLM (Gemini). Falls back to the deterministic local reasoner when absent.
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-1.5-flash"
    llm_provider: str = "gemini"
    llm_timeout_seconds: float = 20.0

    # Redis / background jobs (optional in local development)
    redis_url: str = "redis://localhost:6379/0"
    enable_background_tasks: bool = False

    # Storage
    storage_backend: str = "local"
    upload_dir: str = (BASE_DIR / "uploads").as_posix()
    public_base_url: str = "http://localhost:8000"
    max_upload_mb: int = 8

    # CORS
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8081,http://localhost:19006"

    # Rate limiting
    rate_limit_per_minute: int = 240

    # Seed
    seed_demo_data: bool = True
    demo_password: str = "Demo@1234"

    @model_validator(mode="after")
    def validate_deployment_security(self) -> "Settings":
        if self.environment.strip().lower() in {"development", "test", "testing"}:
            return self
        if self.seed_demo_data:
            raise ValueError("SEED_DEMO_DATA must be false outside development and test environments")
        if len(self.jwt_secret.strip()) < 32 or self.jwt_secret.strip() in {
            DEVELOPMENT_JWT_SECRET,
            "replace-with-a-long-random-secret",
            "change-this-in-production",
        }:
            raise ValueError("JWT_SECRET must be a generated secret of at least 32 characters outside development and test environments")
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
