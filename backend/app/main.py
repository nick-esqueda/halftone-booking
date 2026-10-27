"""Builds the FastAPI application."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.errors import register_error_handlers
from app.routers import bookings, equipment, health

API_TITLE = "Halftone Booking API"


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=API_TITLE)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(app)
    app.include_router(equipment.router)
    app.include_router(bookings.router)
    app.include_router(health.router)
    return app


app = create_app()
