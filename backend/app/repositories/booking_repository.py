"""Database access for bookings, their items and their history."""

from collections.abc import Iterable
from datetime import datetime
from typing import Final

from sqlalchemy import Select, func, select
from sqlalchemy.dialects.postgresql import Range
from sqlalchemy.orm import Session, selectinload

from app.models import Booking, BookingEvent, BookingItem

HALF_OPEN_BOUNDS: Final = "[)"


def build_period(starts_at: datetime, ends_at: datetime) -> Range[datetime]:
    """A half-open range: 10:00-12:00 and 12:00-14:00 don't overlap."""
    return Range(starts_at, ends_at, bounds=HALF_OPEN_BOUNDS)


def _select_bookings_with_items() -> Select[Booking]:
    items_with_equipment = selectinload(Booking.items).selectinload(
        BookingItem.equipment
    )
    return select(Booking).options(items_with_equipment)


def _select_active_items_overlapping(
    period: Range[datetime],
) -> Select[BookingItem]:
    return (
        select(BookingItem)
        .options(selectinload(BookingItem.booking), selectinload(BookingItem.equipment))
        .where(BookingItem.cancelled_at.is_(None))
        .where(BookingItem.period.overlaps(period))
    )


class BookingRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, booking_id: int) -> Booking | None:
        query = _select_bookings_with_items().where(Booking.id == booking_id)
        return self.session.scalars(query).first()

    def get_for_update(self, booking_id: int) -> Booking | None:
        """Load a booking and lock its row until the transaction ends.

        The lock makes two simultaneous edits of the same booking take turns,
        so the version check can't be raced.
        """
        query = (
            _select_bookings_with_items()
            .where(Booking.id == booking_id)
            .with_for_update(of=Booking)
        )
        return self.session.scalars(query).first()

    def find_conflicting_items(
        self,
        equipment_ids: Iterable[int],
        period: Range[datetime],
        excluded_booking_id: int | None = None,
    ) -> list[BookingItem]:
        query = _select_active_items_overlapping(period).where(
            BookingItem.equipment_id.in_(list(equipment_ids))
        )
        if excluded_booking_id is not None:
            query = query.where(BookingItem.booking_id != excluded_booking_id)
        return list(self.session.scalars(query.order_by(BookingItem.id)))

    def list_active_items_overlapping(
        self, period: Range[datetime]
    ) -> list[BookingItem]:
        query = _select_active_items_overlapping(period).order_by(BookingItem.period)
        return list(self.session.scalars(query))

    def list_by_booker(self, booker_name: str) -> list[Booking]:
        name_matches = func.lower(Booking.booker_name) == booker_name.lower()
        query = _select_bookings_with_items().where(name_matches).order_by(Booking.id)
        return list(self.session.scalars(query))

    def has_any_bookings(self) -> bool:
        query = select(Booking.id).limit(1)
        return self.session.scalar(query) is not None

    def list_booker_names(self) -> list[str]:
        query = select(Booking.booker_name).distinct().order_by(Booking.booker_name)
        return list(self.session.scalars(query))

    def list_events(self, booking_id: int) -> list[BookingEvent]:
        query = (
            select(BookingEvent)
            .where(BookingEvent.booking_id == booking_id)
            .order_by(BookingEvent.id)
        )
        return list(self.session.scalars(query))

    def add(self, entity: Booking | BookingItem | BookingEvent) -> None:
        self.session.add(entity)
