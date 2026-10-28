"""Converting between the studio's local time and UTC.

Clients may send times with an offset (`2026-10-29T13:00:00-05:00`) or
without one (`2026-10-29T13:00`). Times without an offset are studio wall
clock time. Daylight-saving rules:

- A wall-clock time skipped by the spring-forward change (2:30 AM) doesn't
  exist, so it is rejected.
- A wall-clock time repeated by the fall-back change (1:30 AM) means its
  first occurrence.
"""

from datetime import UTC, datetime
from typing import Protocol
from zoneinfo import ZoneInfo

from app.errors import InvalidBookingError

FIRST_OCCURRENCE_FOLD = 0
HOURS_ON_CLOCK_FACE = 12


class Clock(Protocol):
    """Source of the current time. Tests swap in a fixed clock."""

    def now(self) -> datetime: ...


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(UTC)


def convert_to_utc(value: datetime, studio_zone: ZoneInfo) -> datetime:
    """Return `value` in UTC, treating a value with no offset as studio time."""
    if value.tzinfo is not None:
        return value.astimezone(UTC)

    local_time = value.replace(tzinfo=studio_zone, fold=FIRST_OCCURRENCE_FOLD)
    utc_time = local_time.astimezone(UTC)
    round_trip = utc_time.astimezone(studio_zone).replace(tzinfo=None)
    if round_trip != value:
        raise InvalidBookingError(
            "nonexistent_time",
            f"{value:%b %d}, {format_clock_time(value)} doesn't exist in studio time "
            "because the clocks jump forward then.",
        )
    return utc_time


def convert_to_studio_time(value: datetime, studio_zone: ZoneInfo) -> datetime:
    return value.astimezone(studio_zone)


def is_on_time_step(value: datetime, studio_zone: ZoneInfo, step_minutes: int) -> bool:
    """True when `value` falls exactly on the booking grid, in studio time."""
    local_time = value.astimezone(studio_zone)
    has_no_seconds = local_time.second == 0 and local_time.microsecond == 0
    return has_no_seconds and local_time.minute % step_minutes == 0


def format_clock_time(value: datetime) -> str:
    """12-hour clock time without a leading zero, e.g. "1:05 PM" or "12:00 AM"."""
    hour = value.hour % HOURS_ON_CLOCK_FACE or HOURS_ON_CLOCK_FACE
    return f"{hour}:{value:%M %p}"


def format_day_and_time(value: datetime) -> str:
    """Day and 12-hour time, e.g. "Thu Oct 29, 1:00 PM"."""
    return f"{value:%a %b %d}, {format_clock_time(value)}"
