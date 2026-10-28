"""Domain errors and how they map to HTTP responses.

Services raise these errors; they never build HTTP responses themselves.
`register_error_handlers` turns each one into the shared JSON error shape:
`{"code": ..., "message": ..., "conflicts": [...], "request_id": ...}`.
The request ID lets someone match an error they saw to the API's logs.

To add a new error: subclass `BookingError`, give it a `code`, and add the
class to `HTTP_STATUS_BY_ERROR` with the status it should return.

Failures outside the booking rules use the same shape: a database outage
becomes a 503 and any other unexpected error a 500, so the UI can always
show a readable message.
"""

import logging
from collections.abc import Mapping
from dataclasses import asdict, dataclass
from datetime import datetime

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import InterfaceError, OperationalError

from app.observability.request_context import get_request_id
from app.observability.request_logging_middleware import REQUEST_ID_HEADER

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Conflict:
    """One existing reservation that blocks a requested item."""

    equipment_id: int
    equipment_name: str
    booking_id: int
    booker_name: str
    starts_at: datetime
    ends_at: datetime


class BookingError(Exception):
    code = "booking_error"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class InvalidBookingError(BookingError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class NotFoundError(BookingError):
    code = "not_found"


class StaleVersionError(BookingError):
    code = "stale_version"


class BookingConflictError(BookingError):
    code = "conflict"

    def __init__(self, message: str, conflicts: list[Conflict]) -> None:
        super().__init__(message)
        self.conflicts = conflicts


class AssistantUnavailableError(BookingError):
    """The AI assistant is switched off, or its provider can't be reached."""

    code = "assistant_unavailable"


class RateLimitedError(BookingError):
    code = "rate_limited"


HTTP_STATUS_BY_ERROR: dict[type[BookingError], int] = {
    InvalidBookingError: 422,
    NotFoundError: 404,
    StaleVersionError: 409,
    BookingConflictError: 409,
    AssistantUnavailableError: 503,
    RateLimitedError: 429,
}
DEFAULT_ERROR_STATUS = 400


def add_request_id(body: Mapping[str, object]) -> dict[str, object]:
    return {**body, "request_id": get_request_id()}


def build_error_body(error: BookingError) -> dict[str, object]:
    """Build the JSON body every API error shares."""
    conflicts = getattr(error, "conflicts", [])
    conflict_dicts = [asdict(conflict) for conflict in conflicts]
    body = {"code": error.code, "message": error.message, "conflicts": conflict_dicts}
    return add_request_id(body)


async def handle_booking_error(request: Request, error: Exception) -> JSONResponse:
    assert isinstance(error, BookingError)
    status_code = HTTP_STATUS_BY_ERROR.get(type(error), DEFAULT_ERROR_STATUS)

    # The message is left out: it can name the person holding the equipment.
    fields = {"error_code": error.code, "status_code": status_code}
    logger.warning("Request rejected: %s", error.code, extra=fields)

    body = build_error_body(error)
    return JSONResponse(status_code=status_code, content=_make_json_safe(body))


def _make_json_safe(body: dict[str, object]) -> dict[str, object]:
    """Convert datetimes inside conflict entries to ISO strings."""
    conflicts = body["conflicts"]
    assert isinstance(conflicts, list)
    for conflict in conflicts:
        conflict["starts_at"] = conflict["starts_at"].isoformat()
        conflict["ends_at"] = conflict["ends_at"].isoformat()
    return body


async def handle_request_validation_error(
    request: Request, error: Exception
) -> JSONResponse:
    """Malformed requests (missing fields, bad dates) use the same error shape."""
    assert isinstance(error, RequestValidationError)
    first_problem = error.errors()[0]
    field_path = ".".join(str(part) for part in first_problem["loc"])
    message = f"{field_path}: {first_problem['msg']}"
    logger.warning("Invalid request: %s", message, extra={"field": field_path})

    body = {"code": "invalid_request", "message": message, "conflicts": []}
    return JSONResponse(status_code=422, content=add_request_id(body))


# Errors that mean the database can't be reached right now. To treat another
# infrastructure error as "temporarily unavailable", add its class here.
UNAVAILABLE_ERRORS: tuple[type[Exception], ...] = (OperationalError, InterfaceError)

SERVICE_UNAVAILABLE_BODY = {
    "code": "service_unavailable",
    "message": "Booking is temporarily unavailable. Please try again in a minute.",
    "conflicts": [],
}
INTERNAL_ERROR_BODY = {
    "code": "internal_error",
    "message": "Something went wrong on our side. Please try again.",
    "conflicts": [],
}


async def handle_unavailable_error(request: Request, error: Exception) -> JSONResponse:
    error_text = f"{type(error).__name__}: {error}"
    fields = {"path": request.url.path, "error": error_text}
    logger.error("Database unavailable", extra=fields)
    body = add_request_id(SERVICE_UNAVAILABLE_BODY)
    return JSONResponse(status_code=503, content=body)


async def handle_unexpected_error(request: Request, error: Exception) -> JSONResponse:
    """Runs outside the request middleware, so it sets the ID header itself."""
    fields = {"path": request.url.path}
    logger.exception("Unexpected error", exc_info=error, extra=fields)
    request_id = get_request_id()
    body = add_request_id(INTERNAL_ERROR_BODY)
    headers = {REQUEST_ID_HEADER: request_id}
    return JSONResponse(status_code=500, content=body, headers=headers)


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(BookingError, handle_booking_error)
    app.add_exception_handler(RequestValidationError, handle_request_validation_error)
    for error_class in UNAVAILABLE_ERRORS:
        app.add_exception_handler(error_class, handle_unavailable_error)
    app.add_exception_handler(Exception, handle_unexpected_error)
