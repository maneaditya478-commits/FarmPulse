"""Secure animal photo storage and optional image analysis hooks."""

import io
import logging
import uuid
from pathlib import Path

from fastapi import UploadFile
from PIL import Image, UnidentifiedImageError

from app.core.config import settings
from app.core.errors import AppError

logger = logging.getLogger("alg.storage")

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _ensure_dir() -> Path:
    path = Path(settings.upload_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def save_animal_photo(upload: UploadFile) -> str:
    if upload.content_type not in ALLOWED_TYPES:
        raise AppError(400, "unsupported_file", "Only JPEG, PNG or WebP images are accepted")
    raw = upload.file.read()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(raw) > max_bytes:
        raise AppError(413, "file_too_large", f"Image exceeds {settings.max_upload_mb} MB")
    if not raw:
        raise AppError(400, "empty_file", "Uploaded file is empty")
    try:
        image = Image.open(io.BytesIO(raw))
        image.verify()
        image = Image.open(io.BytesIO(raw))
    except (UnidentifiedImageError, OSError) as exc:
        raise AppError(400, "invalid_image", "The uploaded file is not a valid image") from exc

    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")
    image.thumbnail((1600, 1600))
    filename = f"{uuid.uuid4().hex}.jpg"
    target = _ensure_dir() / filename
    image.save(target, format="JPEG", quality=86, optimize=True)
    return f"{settings.public_base_url.rstrip('/')}/uploads/{filename}"


def analyze_image_optional(path: str | None) -> dict:
    """Adapter for future YOLO/OpenCV inference. Reports honestly when no model is configured."""
    if not path:
        return {"available": False, "model": None, "note": "No image supplied."}
    return {
        "available": False,
        "model": None,
        "note": "Visual inference model is not configured in this deployment. Triage uses reported signs and observations only.",
    }
