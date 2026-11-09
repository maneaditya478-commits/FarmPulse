"""Request logging, security headers and an in-process rate limiter."""

import logging
import time
import uuid
from collections import defaultdict, deque

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings

access_logger = logging.getLogger("alg.access")
security_logger = logging.getLogger("alg.security")


class ObservabilityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = request_id
        started = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - started) * 1000
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time-ms"] = f"{elapsed_ms:.1f}"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        access_logger.info(
            "%s %s %s %.1fms request_id=%s",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
            request_id,
        )
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Token-bucket style limiter. Single-process only; Redis is used in production deployments."""

    def __init__(self, app, limit_per_minute: int | None = None) -> None:
        super().__init__(app)
        self.limit = limit_per_minute or settings.rate_limit_per_minute
        self.window = 60.0
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next):
        if request.url.path in {"/health", "/docs", "/openapi.json"}:
            return await call_next(request)
        client = request.client.host if request.client else "unknown"
        now = time.monotonic()
        bucket = self.hits[client]
        while bucket and now - bucket[0] > self.window:
            bucket.popleft()
        if len(bucket) >= self.limit:
            security_logger.warning("rate_limit_exceeded client=%s path=%s", client, request.url.path)
            return JSONResponse(
                status_code=429,
                content={"error": {"code": "rate_limited", "message": "Too many requests. Please retry shortly."}},
                headers={"Retry-After": "60"},
            )
        bucket.append(now)
        return await call_next(request)
