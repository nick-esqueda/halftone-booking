"""Turning booking rows into API responses, with times in studio time."""

from zoneinfo import ZoneInfo

from app.models import Booking
from app.schemas import BookingItemResponse, BookingResponse
from app.services.booking_times import get_booking_span, get_shown_items
from app.studio_time import convert_to_studio_time


def build_booking_response(booking: Booking, studio_zone: ZoneInfo) -> BookingResponse:
    span = get_booking_span(booking)
    shown_items = get_shown_items(booking)
    items = [
        BookingItemResponse(
            equipment_id=item.equipment_id, equipment_name=item.equipment.name
        )
        for item in shown_items
    ]
    return BookingResponse(
        id=booking.id,
        booker_name=booking.booker_name,
        purpose=booking.purpose,
        starts_at=convert_to_studio_time(span.starts_at, studio_zone),
        ends_at=convert_to_studio_time(span.ends_at, studio_zone),
        is_cancelled=booking.is_cancelled,
        version=booking.version,
        items=items,
    )
