"""ASGI middleware: gives each request an ID and logs one line when it ends.

The ID comes from the caller's `X-Request-ID` header when it is well
formed (so the browser and the API can share one ID), and is a new UUID
otherwise. The response always carries it back in `X-Request-ID`.

The finished-request line holds the method, path, status and duration.
The query string is left out because it can hold names.
"""

import logging
import re
import time
import uuid

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.observability.levels import TRACE
from app.observability.request_context import set_request_id

REQUEST_ID_HEADER = "X-Request-ID"
REQUEST_ID_HEADER_KEY = REQUEST_ID_HEADER.lower().encode("latin-1")

# Callers can't push long or odd strings into our logs through the header.
VALID_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9-]{8,64}$")

# Health checks poll every few seconds; log them at TRACE so they don't
# drown out the DEBUG log.
QUIET_PATHS = frozenset({"/api/health"})

# The status we report when the app raises before sending a response.
UNHANDLED_ERROR_STATUS = 500
MILLISECONDS_PER_SECOND = 1000

access_logger = logging.getLogger("app.http")


def choose_request_id(scope: Scope) -> str:
    """Reuse the caller's X-Request-ID when it is well formed; else make one."""
    headers: dict[bytes, bytes] = dict(scope["headers"])
    candidate = headers.get(REQUEST_ID_HEADER_KEY, b"").decode("latin-1")
    if VALID_REQUEST_ID_PATTERN.match(candidate):
        return candidate
    return str(uuid.uuid4())


def choose_access_level(path: str, duration_ms: int, slow_request_ms: int) -> int:
    if duration_ms > slow_request_ms:
        return logging.WARNING
    if path in QUIET_PATHS:
        return TRACE
    return logging.INFO


class ResponseTracker:
    """Wraps `send` to add the request ID header and remember the status."""

    def __init__(self, send: Send, request_id: str) -> None:
        self.send = send
        self.request_id = request_id
        self.status_code = UNHANDLED_ERROR_STATUS

    async def __call__(self, message: Message) -> None:
        if message["type"] == "http.response.start":
            self.status_code = message["status"]
            message.setdefault("headers", [])
            headers = MutableHeaders(scope=message)
            headers.append(REQUEST_ID_HEADER, self.request_id)
        await self.send(message)


class RequestLoggingMiddleware:
    def __init__(self, app: ASGIApp, slow_request_ms: int) -> None:
        self.app = app
        self.slow_request_ms = slow_request_ms

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Not reset when the request ends: the 500 handler runs outside this
        # middleware and still needs the ID. Every request sets its own.
        request_id = choose_request_id(scope)
        set_request_id(request_id)

        tracker = ResponseTracker(send, request_id)
        started_at = time.perf_counter()
        try:
            await self.app(scope, receive, tracker)
        finally:
            elapsed_seconds = time.perf_counter() - started_at
            duration_ms = round(elapsed_seconds * MILLISECONDS_PER_SECOND)
            self.log_finished_request(scope, tracker.status_code, duration_ms)

    def log_finished_request(
        self, scope: Scope, status_code: int, duration_ms: int
    ) -> None:
        method = scope["method"]
        path = scope["path"]
        level = choose_access_level(path, duration_ms, self.slow_request_ms)
        fields = {
            "method": method,
            "path": path,
            "status_code": status_code,
            "duration_ms": duration_ms,
        }
        access_logger.log(level, "%s %s %s", method, path, status_code, extra=fields)
