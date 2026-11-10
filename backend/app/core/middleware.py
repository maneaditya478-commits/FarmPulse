"""Request logging, security headers and a rate limiter (in-memory or Redis-backed)."""

import logging
import time
import uuid
from collections import defaultdict, deque
from contextlib import suppress

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


class _InMemoryRateLimiter:
    """Per-worker in-memory rate limiter (single process only)."""

    def __init__(self, limit: int, window: float) -> None:
        self.limit = limit
        self.window = window
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    async def check(self, client: str, now: float) -> bool:
        bucket = self.hits[client]
        while bucket and now - bucket[0] > self.window:
            bucket.popleft()
        if len(bucket) >= self.limit:
            return False
        bucket.append(now)
        return True


class _RedisRateLimiter:
    """Redis-backed distributed rate limiter."""

    def __init__(self, redis_url: str, limit: int, window: int) -> None:
        import redis.asyncio as redis
        self.client = redis.from_url(redis_url, encoding="utf-8", decode_responses=True)
        self.limit = limit
        self.window = window

    async def check(self, client: str, now: float) -> bool:
        key = f"ratelimit:{client}"
        pipe = self.client.pipeline()
        pipe.zremrangebyscore(key, 0, now - self.window)
        pipe.zcard(key)
        pipe.zadd(key, {str(now): now})
        pipe.expire(key, self.window)
        results = await pipe.execute()
        current = results[1]
        if current >= self.limit:
            return False
        return True


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiter with Redis backend in production, in-memory fallback for local dev."""

    def __init__(self, app, limit_per_minute: int | None = None) -> None:
        super().__init__(app)
        self.limit = limit_per_minute or settings.rate_limit_per_minute
        self.window = 60.0
        self._limiter = None
        self._redis_initialized = False

    def _get_limiter(self):
        if self._limiter is not None:
            return self._limiter
        if self._redis_initialized:
            # Redis init was attempted but failed; fall back to in-memory
            return _InMemoryRateLimiter(self.limit, self.window)
        if settings.redis_url and settings.environment not in {"development", "test", "testing"}:
            try:
                import redis.asyncio  # noqa: F401 - ensure available
                self._limiter = _RedisRateLimiter(settings.redis_url, self.limit, int(self.window))
            except Exception as exc:  # noqa: BLE001
                logging.getLogger("alg.ratelimit").warning("redis_rate_limiter_unavailable, falling back to in-memory: %s", exc)
                self._limiter = _InMemoryRateLimiter(self.limit, self.window)
        else:
            self._limiter = _InMemoryRateLimiter(self.limit, self.window)
        self._redis_initialized = True
        return self._limiter

    async def dispatch(self, request: Request, call_next):
        if request.url.path in {"/health", "/docs", "/openapi.json", "/uploads"}:
            return await call_next(request)
        client = request.client.host if request.client else "unknown"
        now = time.monotonic()
        limiter = self._get_limiter()
        if not await limiter.check(client, now):
            security_logger.warning("rate_limit_exceeded client=%s path=%s", client, request.url.path)
            return JSONResponse(
                status_code=429,
                content={"error": {"code": "rate_limited", "message": "Too many requests. Please retry shortly."}},
                headers={"Retry-After": "60"},
            )
        return await call_next(request)
