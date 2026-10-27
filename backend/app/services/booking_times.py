"""Working out a booking's overall time from its items.

A booking's start and end are never stored on the booking itself; each item
row holds its own time range. These helpers read the time back from items.
"""

from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

from app.models import Booking, BookingItem

TIME_FORMAT = "%a %b %d, %H:%M"


@dataclass(frozen=True)
class TimeSpan:
    starts_at: datetime
    ends_at: datetime


def get_item_span(item: BookingItem) -> TimeSpan:
    period = item.period
    assert period.lower is not None and period.upper is not None
    return TimeSpan(starts_at=period.lower, ends_at=period.upper)


def get_shown_items(booking: Booking) -> list[BookingItem]:
    """Active items, or for a cancelled booking, the items it held when cancelled.

    Items dropped by an earlier edit were cancelled before the booking was,
    so they are left out.
    """
    if booking.active_items:
        return booking.active_items
    last_cancelled_at = max(
        item.cancelled_at for item in booking.items if item.cancelled_at
    )
    return [item for item in booking.items if item.cancelled_at == last_cancelled_at]


def get_booking_span(booking: Booking) -> TimeSpan:
    """The booking's overall time, read from the items it holds."""
    items = get_shown_items(booking)
    item_spans = [get_item_span(item) for item in items]
    earliest_start = min(span.starts_at for span in item_spans)
    latest_end = max(span.ends_at for span in item_spans)
    return TimeSpan(starts_at=earliest_start, ends_at=latest_end)


def describe_span(span: TimeSpan, studio_zone: ZoneInfo) -> str:
    """Human-readable range in studio time, e.g. "Thu Oct 29, 13:00 to Thu Oct 29, 17:00"."""
    start_text = span.starts_at.astimezone(studio_zone).strftime(TIME_FORMAT)
    end_text = span.ends_at.astimezone(studio_zone).strftime(TIME_FORMAT)
    return f"{start_text} to {end_text}"
