"""FastAPI dependencies that build services for each request.

Tests override `get_clock` to freeze time; everything else comes from here.
"""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_session
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
