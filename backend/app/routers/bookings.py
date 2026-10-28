"""HTTP endpoints for bookings. Each one hands straight off to BookingService."""

from zoneinfo import ZoneInfo

from fastapi import APIRouter, Query, status

from app.dependencies import BookingServiceDependency, SettingsDependency
from app.routers.responses import ERROR_MODEL, SERVER_ERROR_RESPONSES
from app.schemas import (
    BookingCancelRequest,
    BookingCreateRequest,
    BookingEventResponse,
    BookingResponse,
    BookingUpdateRequest,
)
from app.services.booking_presenter import build_booking_response

ERROR_RESPONSES: dict[int | str, dict[str, object]] = {
    **SERVER_ERROR_RESPONSES,
    404: ERROR_MODEL,
    409: ERROR_MODEL,
    422: ERROR_MODEL,
}

router = APIRouter(prefix="/api", tags=["bookings"], responses=ERROR_RESPONSES)


@router.post("/bookings", status_code=status.HTTP_201_CREATED)
def create_booking(
    request: BookingCreateRequest,
    service: BookingServiceDependency,
    settings: SettingsDependency,
) -> BookingResponse:
    booking = service.create_booking(request)
    return build_booking_response(booking, ZoneInfo(settings.studio_timezone))


@router.get("/bookings")
def list_bookings(
    service: BookingServiceDependency,
    settings: SettingsDependency,
    booker_name: str = Query(
        description="Whose bookings to list, matched case-insensitively."
    ),
) -> list[BookingResponse]:
    zone = ZoneInfo(settings.studio_timezone)
    bookings = service.list_bookings_for(booker_name)
    return [build_booking_response(booking, zone) for booking in bookings]


@router.get("/bookings/{booking_id}")
def get_booking(
    booking_id: int, service: BookingServiceDependency, settings: SettingsDependency
) -> BookingResponse:
    booking = service.get_booking(booking_id)
    return build_booking_response(booking, ZoneInfo(settings.studio_timezone))


@router.put("/bookings/{booking_id}")
def update_booking(
    booking_id: int,
    request: BookingUpdateRequest,
    service: BookingServiceDependency,
    settings: SettingsDependency,
) -> BookingResponse:
    booking = service.update_booking(booking_id, request)
    return build_booking_response(booking, ZoneInfo(settings.studio_timezone))


@router.post("/bookings/{booking_id}/cancel")
def cancel_booking(
    booking_id: int,
    request: BookingCancelRequest,
    service: BookingServiceDependency,
    settings: SettingsDependency,
) -> BookingResponse:
    booking = service.cancel_booking(booking_id, request)
    return build_booking_response(booking, ZoneInfo(settings.studio_timezone))


@router.get("/bookings/{booking_id}/history")
def get_booking_history(
    booking_id: int, service: BookingServiceDependency
) -> list[BookingEventResponse]:
    events = service.list_history(booking_id)
    return [BookingEventResponse.model_validate(event) for event in events]


@router.get("/booker-names")
def list_booker_names(service: BookingServiceDependency) -> list[str]:
    """Names used on past bookings, for autocomplete."""
    return service.list_booker_names()
