"""AI Livestock Guardian — FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1 import (
    admin,
    ai,
    analytics,
    animals,
    appointments,
    auth,
    environment,
    farms,
    finance,
    health,
    market,
    notifications,
    nutrition,
    sync,
    users,
    vaccinations,
    veterinarians,
)
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.errors import install_error_handlers
from app.core.middleware import ObservabilityMiddleware, RateLimitMiddleware

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("alg.app")


@asynccontextmanager
async def lifespan(_: FastAPI):
    import app.models  # noqa: F401 - register every table on the metadata

    Base.metadata.create_all(bind=engine)
    if settings.seed_demo_data:
        from app.seed.demo import seed_demo_data

        with SessionLocal() as db:
            created = seed_demo_data(db)
            if created:
                logger.info("Seeded demo dataset (users=%s)", created.get("users"))
            else:
                logger.info("Demo dataset already present; seed skipped")
    yield


app = FastAPI(
    title=settings.app_name,
    description=(
        "Agentic AI-powered livestock healthcare, nutrition and management ecosystem. "
        "Veterinary diagnoses and treatment remain under professional supervision."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Response-Time-ms"],
)
app.add_middleware(ObservabilityMiddleware)
app.add_middleware(RateLimitMiddleware)
install_error_handlers(app)

for module in (
    auth,
    users,
    farms,
    animals,
    health,
    vaccinations,
    nutrition,
    environment,
    veterinarians,
    appointments,
    market,
    finance,
    analytics,
    ai,
    notifications,
    sync,
    admin,
):
    app.include_router(module.router, prefix=settings.api_v1_prefix)

upload_path = Path(settings.upload_dir)
upload_path.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(upload_path)), name="uploads")


@app.get("/", tags=["System"])
def root() -> dict:
    return {
        "app": settings.app_name,
        "version": "1.0.0",
        "tagline": "Protecting Livestock. Empowering Farmers. Securing Rural Income.",
        "docs": "/docs",
        "api": settings.api_v1_prefix,
    }


@app.get("/health", tags=["System"])
def health() -> dict:
    from sqlalchemy import func, select

    from app.models import User

    database_status = "ok"
    try:
        with SessionLocal() as db:
            db.scalar(select(func.count(User.id)))
    except Exception as exc:  # noqa: BLE001 - health probe must never raise
        database_status = f"error: {type(exc).__name__}"
    return {
        "status": "ok" if database_status == "ok" else "degraded",
        "database": database_status,
        "environment": settings.environment,
        "llm_provider": settings.llm_provider if settings.gemini_api_key else "local-expert-rules",
        "demo_data": settings.seed_demo_data,
    }
