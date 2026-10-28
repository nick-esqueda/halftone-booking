"""HTTP endpoint for the AI booking assistant."""

from fastapi import APIRouter, Request

from app.assistant.llm import LLMUnavailableError
from app.dependencies import AssistantServiceDependency, RateLimiterDependency
from app.errors import AssistantUnavailableError, RateLimitedError
from app.routers.responses import ERROR_MODEL, SERVER_ERROR_RESPONSES
from app.schemas import AssistantReply, AssistantRequest

router = APIRouter(
    prefix="/api/assistant",
    tags=["assistant"],
    responses={**SERVER_ERROR_RESPONSES, 422: ERROR_MODEL, 429: ERROR_MODEL},
)

UNKNOWN_CLIENT = "unknown"
RATE_LIMITED_MESSAGE = "That's a lot of requests. Please wait a minute and try again."
PROVIDER_DOWN_MESSAGE = (
    "The booking assistant can't be reached right now. "
    "You can still book with + New booking."
)


@router.post("/draft")
def draft_booking(
    request: AssistantRequest,
    http_request: Request,
    service: AssistantServiceDependency,
    rate_limiter: RateLimiterDependency,
) -> AssistantReply:
    """Turn a plain-English request into a draft or a question. Never saves."""
    client_address = http_request.client.host if http_request.client else UNKNOWN_CLIENT
    if not rate_limiter.allow(client_address):
        raise RateLimitedError(RATE_LIMITED_MESSAGE)
    try:
        return service.reply(request)
    except LLMUnavailableError as error:
        raise AssistantUnavailableError(PROVIDER_DOWN_MESSAGE) from error
