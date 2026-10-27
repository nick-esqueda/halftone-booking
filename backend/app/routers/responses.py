"""Error responses shared by every router, for the OpenAPI schema.

Any endpoint can fail with a 503 (database unavailable) or a 500
(unexpected error), both in the shared error shape. Routers add their own
4xx entries on top: `{**SERVER_ERROR_RESPONSES, 404: ...}`.
"""

from app.schemas import ErrorResponse

ERROR_MODEL: dict[str, object] = {"model": ErrorResponse}

SERVER_ERROR_RESPONSES: dict[int | str, dict[str, object]] = {
    500: ERROR_MODEL,
    503: ERROR_MODEL,
}
