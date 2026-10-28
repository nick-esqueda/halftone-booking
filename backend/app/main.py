"""Builds the FastAPI application."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.errors import register_error_handlers
from app.observability.request_context import bind_request_id
from app.observability.request_logging_middleware import (
    REQUEST_ID_HEADER,
    RequestLoggingMiddleware,
)
from app.observability.setup import configure_logging
from app.routers import bookings, equipment, health

API_TITLE = "Halftone Booking API"

# The request ID on lines logged while the app is being built.
STARTUP_REQUEST_ID = "startup"

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings)
    app = FastAPI(title=API_TITLE)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[REQUEST_ID_HEADER],
    )
    # Added last so it runs first: every response, CORS included, gets an ID.
    app.add_middleware(
        RequestLoggingMiddleware, slow_request_ms=settings.slow_request_ms
    )
    register_error_handlers(app)
    app.include_router(equipment.router)
    app.include_router(bookings.router)
    app.include_router(health.router)

    log_startup(settings)
    return app


def log_startup(settings: Settings) -> None:
    """Record the settings that shape behavior; never secrets or the DB URL."""
    fields = {
        "log_level": settings.log_level,
        "log_sinks": settings.log_sinks,
        "studio_timezone": settings.studio_timezone,
        "time_step_minutes": settings.time_step_minutes,
        "max_booking_days": settings.max_booking_days,
    }
    with bind_request_id(STARTUP_REQUEST_ID):
        logger.info("API configured", extra=fields)


app = create_app()
