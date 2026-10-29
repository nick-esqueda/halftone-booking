"""FastAPI dependencies that build services for each request.

Tests override `get_clock` to freeze time and `get_llm_provider` to script
the assistant's model; everything else comes from here.
"""

from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.assistant.assistant_service import AssistantService
from app.assistant.llm import LLMProvider
from app.assistant.llm_logging import LoggingLLMProvider
from app.assistant.providers import build_llm_provider
from app.assistant.rate_limit import SlidingWindowRateLimiter
from app.assistant.tools import build_tool_context
from app.config import Settings, get_settings
from app.db import get_session
from app.errors import AssistantUnavailableError
from app.services.availability_service import AvailabilityService
from app.services.booking_service import BookingService
from app.studio_time import Clock, SystemClock

SessionDependency = Annotated[Session, Depends(get_session)]
SettingsDependency = Annotated[Settings, Depends(get_settings)]


def get_clock() -> Clock:
    return SystemClock()


ClockDependency = Annotated[Clock, Depends(get_clock)]


def get_booking_service(
    session: SessionDependency, settings: SettingsDependency, clock: ClockDependency
) -> BookingService:
    return BookingService(session, settings, clock)


def get_availability_service(
    session: SessionDependency, settings: SettingsDependency
) -> AvailabilityService:
    return AvailabilityService(session, settings)


BookingServiceDependency = Annotated[BookingService, Depends(get_booking_service)]
AvailabilityServiceDependency = Annotated[
    AvailabilityService, Depends(get_availability_service)
]


@lru_cache
def get_llm_provider() -> LLMProvider | None:
    """The assistant's model, built once; None when no provider is configured."""
    return build_llm_provider(get_settings())


LLMProviderDependency = Annotated[LLMProvider | None, Depends(get_llm_provider)]

RATE_LIMIT_WINDOW_SECONDS = 60


@lru_cache
def get_assistant_rate_limiter() -> SlidingWindowRateLimiter:
    settings = get_settings()
    return SlidingWindowRateLimiter(
        settings.assistant_requests_per_minute, RATE_LIMIT_WINDOW_SECONDS
    )


RateLimiterDependency = Annotated[
    SlidingWindowRateLimiter, Depends(get_assistant_rate_limiter)
]

ASSISTANT_OFF_MESSAGE = "The booking assistant isn't set up on this server."


def get_assistant_service(
    session: SessionDependency,
    settings: SettingsDependency,
    clock: ClockDependency,
    provider: LLMProviderDependency,
) -> AssistantService:
    if provider is None:
        raise AssistantUnavailableError(ASSISTANT_OFF_MESSAGE)
    context = build_tool_context(session, settings, clock)
    logged_provider = LoggingLLMProvider(provider, settings)
    return AssistantService(logged_provider, context, settings)


AssistantServiceDependency = Annotated[AssistantService, Depends(get_assistant_service)]
