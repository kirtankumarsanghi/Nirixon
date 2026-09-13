"""
Simple in-process sliding-window rate limiter.

Wired onto /api/screen/* and /api/predict. Single-worker only — same
constraint as InMemorySessionRepo until a shared store lands.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from app.config import get_settings

_PROTECTED_PREFIXES = ("/api/screen", "/api/predict")


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, *, requests: int | None = None, window: int | None = None):
        super().__init__(app)
        settings = get_settings()
        self.requests = (
            requests if requests is not None else settings.rate_limit_requests
        )
        self.window = (
            window if window is not None else settings.rate_limit_window_seconds
        )
        self.enabled = settings.rate_limit_enabled
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def _client_key(self, request: Request) -> str:
        auth = request.headers.get("authorization", "")
        if auth:
            return f"auth:{auth[-24:]}"
        client = request.client.host if request.client else "unknown"
        return f"ip:{client}"

    def _is_protected(self, path: str) -> bool:
        return any(path == p or path.startswith(p + "/") for p in _PROTECTED_PREFIXES)

    async def dispatch(self, request: Request, call_next) -> Response:
        if not self.enabled or not self._is_protected(request.url.path):
            return await call_next(request)

        key = self._client_key(request)
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) >= self.requests:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "rate limit exceeded"},
                )
            q.append(now)

        return await call_next(request)
