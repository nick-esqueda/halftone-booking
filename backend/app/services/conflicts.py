"""Finding and reporting clashes with existing bookings."""

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy.exc import IntegrityError

from app.errors import BookingConflictError, Conflict
from app.models import NO_OVERLAP_CONSTRAINT_NAME, BookingItem
from app.repositories.booking_repository import BookingRepository, build_period
from app.services.booking_times import describe_span, get_item_span


def build_conflict(item: BookingItem, studio_zone: ZoneInfo) -> Conflict:
    span = get_item_span(item)
    return Conflict(
        equipment_id=item.equipment_id,
        equipment_name=item.equipment.name,
        booking_id=item.booking_id,
        booker_name=item.booking.booker_name,
        starts_at=span.starts_at.astimezone(studio_zone),
        ends_at=span.ends_at.astimezone(studio_zone),
    )


def build_conflict_error(
    conflicting_items: list[BookingItem], studio_zone: ZoneInfo
) -> BookingConflictError:
    """Name the first clash in the message and list every clash in the body."""
    conflicts = [build_conflict(item, studio_zone) for item in conflicting_items]
    first_item = conflicting_items[0]
    first_span = describe_span(get_item_span(first_item), studio_zone)
    message = (
        f"{first_item.equipment.name} is already booked by "
        f"{first_item.booking.booker_name}, {first_span}."
    )
    return BookingConflictError(message, conflicts)


def is_overlap_violation(error: IntegrityError) -> bool:
    """True when the database rejected a write because of a double-booking."""
    return NO_OVERLAP_CONSTRAINT_NAME in str(error.orig)


class ConflictChecker:
    def __init__(self, repository: BookingRepository, studio_zone: ZoneInfo) -> None:
        self.repository = repository
        self.studio_zone = studio_zone

    def raise_if_conflicts(
        self,
        equipment_ids: list[int],
        starts_at: datetime,
        ends_at: datetime,
        excluded_booking_id: int | None = None,
    ) -> None:
        period = build_period(starts_at, ends_at)
        conflicting_items = self.repository.find_conflicting_items(
            equipment_ids, period, excluded_booking_id
        )
        if conflicting_items:
            raise build_conflict_error(conflicting_items, self.studio_zone)
