"""The validation rules every new or edited booking must pass.

Pattern: a list of checks (a simple form of the Strategy pattern). Each check
is a function that takes the proposed booking and its context, and returns
an `InvalidBookingError` when the rule is broken or `None` when it holds.
`validate_booking` runs them in order and raises the first error.

To add a rule: write a function with the `BookingCheck` signature and add it
to `BOOKING_CHECKS`. Checks earlier in the list run first, so put cheap
input-shape checks before ones that depend on them.

Conflicts with other bookings are not checked here; the booking service and
the database constraint handle those.
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.config import Settings
from app.errors import InvalidBookingError
from app.models import Equipment
from app.studio_time import is_on_time_step


@dataclass(frozen=True)
class BookingDraft:
    """A proposed booking, with name trimmed and times already in UTC."""

    booker_name: str
    purpose: str
    equipment_ids: list[int]
    starts_at: datetime
    ends_at: datetime


@dataclass(frozen=True)
class OriginalTimes:
    """The saved times of a booking that is being edited."""

    starts_at: datetime
    ends_at: datetime


@dataclass(frozen=True)
class BookingCheckContext:
    now: datetime
    settings: Settings
    studio_zone: ZoneInfo
    equipment_by_id: dict[int, Equipment]
    original_times: OriginalTimes | None = None


BookingCheck = Callable[[BookingDraft, BookingCheckContext], InvalidBookingError | None]


def normalize_name(name: str) -> str:
    """Trim and collapse spaces so "Sam  K " and "Sam K" are the same person."""
    return " ".join(name.split())


def check_name_present(
    draft: BookingDraft, context: BookingCheckContext
) -> InvalidBookingError | None:
    if draft.booker_name:
        return None
    return InvalidBookingError("name_required", "Please enter your name.")


def check_text_lengths(
    draft: BookingDraft, context: BookingCheckContext
) -> InvalidBookingError | None:
    settings = context.settings
    is_name_too_long = len(draft.booker_name) > settings.max_booker_name_length
    is_purpose_too_long = len(draft.purpose) > settings.max_purpose_length
    if not (is_name_too_long or is_purpose_too_long):
        return None
    return InvalidBookingError("text_too_long", "The name or purpose is too long.")


def check_end_after_start(
    draft: BookingDraft, context: BookingCheckContext
) -> InvalidBookingError | None:
    if draft.ends_at > draft.starts_at:
        return None
    return InvalidBookingError(
        "end_before_start", "The end time must be after the start time."
    )


def check_time_step(
    draft: BookingDraft, context: BookingCheckContext
) -> InvalidBookingError | None:
    step = context.settings.time_step_minutes
    zone = context.studio_zone
    is_start_on_step = is_on_time_step(draft.starts_at, zone, step)
    is_end_on_step = is_on_time_step(draft.ends_at, zone, step)
    if is_start_on_step and is_end_on_step:
        return None
    return InvalidBookingError(
        "off_time_step", f"Times must be on a {step}-minute step."
    )


def check_no_duplicate_items(
    draft: BookingDraft, context: BookingCheckContext
) -> InvalidBookingError | None:
    if len(set(draft.equipment_ids)) == len(draft.equipment_ids):
        return None
    return InvalidBookingError("duplicate_item", "Each item can only be added once.")


def check_items_bookable(
    draft: BookingDraft, context: BookingCheckContext
) -> InvalidBookingError | None:
    for equipment_id in draft.equipment_ids:
        equipment = context.equipment_by_id.get(equipment_id)
        if equipment is None or not equipment.is_active:
            return InvalidBookingError(
                "unknown_item", f"Item {equipment_id} can't be booked."
            )
    return None


def check_start_not_in_past(
    draft: BookingDraft, context: BookingCheckContext
) -> InvalidBookingError | None:
    """New bookings, and edits of bookings that haven't started yet."""
    original = context.original_times
    has_original_started = original is not None and original.starts_at <= context.now
    if has_original_started:
        return None

    grace = timedelta(minutes=context.settings.start_grace_minutes)
    if draft.starts_at >= context.now - grace:
        return None
    return InvalidBookingError("start_in_past", "The booking can't start in the past.")


def check_started_booking_edit(
    draft: BookingDraft, context: BookingCheckContext
) -> InvalidBookingError | None:
    """A booking under way can be shortened or extended, but not moved."""
    original = context.original_times
    if original is None or original.starts_at > context.now:
        return None
    if original.ends_at <= context.now:
        return InvalidBookingError(
            "booking_finished", "Finished bookings can't be changed."
        )
    if draft.starts_at != original.starts_at:
        return InvalidBookingError(
            "start_locked", "This booking has started, so its start time can't change."
        )
    if draft.ends_at <= context.now:
        return InvalidBookingError(
            "end_in_past", "The new end time has already passed."
        )
    return None


BOOKING_CHECKS: list[BookingCheck] = [
    check_name_present,
    check_text_lengths,
    check_end_after_start,
    check_time_step,
    check_no_duplicate_items,
    check_items_bookable,
    check_start_not_in_past,
    check_started_booking_edit,
]


def validate_booking(draft: BookingDraft, context: BookingCheckContext) -> None:
    """Raise the first rule the draft breaks; return quietly if it passes all."""
    for check in BOOKING_CHECKS:
        error = check(draft, context)
        if error is not None:
            raise error
