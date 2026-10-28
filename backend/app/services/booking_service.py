"""Creating, editing and cancelling bookings.

This is the one place booking writes happen. The HTTP layer, and later the
AI assistant, call these methods; neither touches the tables directly.
"""

import logging
from zoneinfo import ZoneInfo

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings
from app.errors import InvalidBookingError, NotFoundError, StaleVersionError
from app.models import Booking, BookingEvent, BookingItem
from app.repositories.booking_repository import BookingRepository, build_period
from app.repositories.equipment_repository import EquipmentRepository
from app.schemas import BookingCancelRequest, BookingRequest, BookingUpdateRequest
from app.services.booking_rules import (
    BookingCheckContext,
    BookingDraft,
    OriginalTimes,
    normalize_name,
    validate_booking,
)
from app.services.booking_times import TimeSpan, describe_span, get_booking_span
from app.services.conflicts import ConflictChecker, is_overlap_violation
from app.studio_time import Clock, convert_to_studio_time, convert_to_utc

logger = logging.getLogger(__name__)


def describe_draft_fields(
    draft: BookingDraft, studio_zone: ZoneInfo
) -> dict[str, object]:
    """The draft's equipment and times, in studio time, for log lines."""
    starts_at = convert_to_studio_time(draft.starts_at, studio_zone)
    ends_at = convert_to_studio_time(draft.ends_at, studio_zone)
    return {
        "equipment_ids": draft.equipment_ids,
        "starts_at": starts_at.isoformat(),
        "ends_at": ends_at.isoformat(),
    }


class BookingService:
    def __init__(self, session: Session, settings: Settings, clock: Clock) -> None:
        self.session = session
        self.settings = settings
        self.clock = clock
        self.studio_zone = ZoneInfo(settings.studio_timezone)
        self.bookings = BookingRepository(session)
        self.equipment = EquipmentRepository(session)
        self.conflict_checker = ConflictChecker(self.bookings, self.studio_zone)

    def get_booking(self, booking_id: int) -> Booking:
        booking = self.bookings.get(booking_id)
        if booking is None:
            raise NotFoundError(f"Booking {booking_id} doesn't exist.")
        return booking

    def create_booking(self, request: BookingRequest) -> Booking:
        draft = self._check_new_booking(request)

        # Describe before adding rows: the equipment lookup would otherwise
        # flush them early, outside the conflict handling in `_commit`.
        summary = self._describe(draft)
        booking = Booking(booker_name=draft.booker_name, purpose=draft.purpose)
        self.bookings.add(booking)
        self._add_items(booking, draft.equipment_ids, draft)
        self._record_event(booking, "created", draft.booker_name, summary)

        self._commit(draft, excluded_booking_id=None)
        self._log_saved("Booking created", booking, draft)
        return self.get_booking(booking.id)

    def check_booking(self, request: BookingRequest) -> None:
        """Run every check a new booking must pass, without saving anything.

        Raises the same errors `create_booking` would, so a draft that passes
        here will save unless someone books the slot in the meantime.
        """
        self._check_new_booking(request)

    def update_booking(self, booking_id: int, request: BookingUpdateRequest) -> Booking:
        booking = self._load_editable_booking(booking_id, request.version)
        original_span = get_booking_span(booking)
        draft = self._build_draft(request)
        original_times = OriginalTimes(original_span.starts_at, original_span.ends_at)
        self._validate(draft, original_times)
        self.conflict_checker.raise_if_conflicts(
            draft.equipment_ids, draft.starts_at, draft.ends_at, booking.id
        )

        summary = self._describe(draft)
        booking.booker_name = draft.booker_name
        booking.purpose = draft.purpose
        self._replace_items(booking, draft)
        booking.version += 1
        self._record_event(booking, "updated", draft.booker_name, summary)

        self._commit(draft, excluded_booking_id=booking.id)
        self._log_saved("Booking updated", booking, draft)
        return self.get_booking(booking.id)

    def cancel_booking(self, booking_id: int, request: BookingCancelRequest) -> Booking:
        booking = self._load_editable_booking(booking_id, request.version)
        span = get_booking_span(booking)
        if span.ends_at <= self.clock.now():
            raise InvalidBookingError(
                "booking_finished", "Finished bookings can't be cancelled."
            )

        now = self.clock.now()
        for item in booking.active_items:
            item.cancelled_at = now
        booking.version += 1

        actor_name = normalize_name(request.actor_name) or booking.booker_name
        summary = f"Cancelled {describe_span(span, self.studio_zone)}"
        self._record_event(booking, "cancelled", actor_name, summary)
        self.session.commit()

        fields = {"booking_id": booking.id, "version": booking.version}
        logger.info("Booking cancelled", extra=fields)
        return self.get_booking(booking.id)

    def list_bookings_for(self, booker_name: str) -> list[Booking]:
        bookings = self.bookings.list_by_booker(normalize_name(booker_name))
        logger.debug("Listed bookings for a booker", extra={"count": len(bookings)})
        return bookings

    def list_booker_names(self) -> list[str]:
        return self.bookings.list_booker_names()

    def list_history(self, booking_id: int) -> list[BookingEvent]:
        self.get_booking(booking_id)
        return self.bookings.list_events(booking_id)

    def _check_new_booking(self, request: BookingRequest) -> BookingDraft:
        draft = self._build_draft(request)
        self._validate(draft, original_times=None)
        self.conflict_checker.raise_if_conflicts(
            draft.equipment_ids, draft.starts_at, draft.ends_at
        )
        return draft

    def _build_draft(self, request: BookingRequest) -> BookingDraft:
        draft = BookingDraft(
            booker_name=normalize_name(request.booker_name),
            purpose=request.purpose.strip(),
            equipment_ids=list(request.equipment_ids),
            starts_at=convert_to_utc(request.starts_at, self.studio_zone),
            ends_at=convert_to_utc(request.ends_at, self.studio_zone),
        )

        # Names and purposes are personal, so they appear at DEBUG only.
        fields = describe_draft_fields(draft, self.studio_zone)
        personal_fields = {"booker_name": draft.booker_name, "purpose": draft.purpose}
        logger.debug("Draft built", extra={**fields, **personal_fields})
        return draft

    def _validate(
        self, draft: BookingDraft, original_times: OriginalTimes | None
    ) -> None:
        equipment = self.equipment.get_many(draft.equipment_ids)
        context = BookingCheckContext(
            now=self.clock.now(),
            settings=self.settings,
            studio_zone=self.studio_zone,
            equipment_by_id={item.id: item for item in equipment},
            original_times=original_times,
        )
        validate_booking(draft, context)

    def _load_editable_booking(self, booking_id: int, expected_version: int) -> Booking:
        booking = self.bookings.get_for_update(booking_id)
        if booking is None:
            raise NotFoundError(f"Booking {booking_id} doesn't exist.")
        if booking.version != expected_version:
            versions = {"expected": expected_version, "actual": booking.version}
            logger.debug("Stale booking version", extra=versions)
            raise StaleVersionError(
                "Someone else changed this booking since you opened it."
            )
        if booking.is_cancelled:
            raise InvalidBookingError(
                "booking_cancelled", "This booking is already cancelled."
            )
        return booking

    def _add_items(
        self, booking: Booking, equipment_ids: list[int], draft: BookingDraft
    ) -> None:
        period = build_period(draft.starts_at, draft.ends_at)
        for equipment_id in equipment_ids:
            item = BookingItem(
                booking=booking, equipment_id=equipment_id, period=period
            )
            self.bookings.add(item)

    def _replace_items(self, booking: Booking, draft: BookingDraft) -> None:
        """Update kept items in place, cancel dropped ones, add new ones.

        Kept rows are updated rather than deleted and re-added, so a booking
        never clashes with its own old time slot.
        """
        period = build_period(draft.starts_at, draft.ends_at)
        requested_ids = set(draft.equipment_ids)
        kept_ids = set()
        for item in booking.active_items:
            if item.equipment_id in requested_ids:
                item.period = period
                kept_ids.add(item.equipment_id)
            else:
                item.cancelled_at = self.clock.now()

        new_ids = [
            equipment_id
            for equipment_id in draft.equipment_ids
            if equipment_id not in kept_ids
        ]
        self._add_items(booking, new_ids, draft)

    def _log_saved(self, message: str, booking: Booking, draft: BookingDraft) -> None:
        fields = describe_draft_fields(draft, self.studio_zone)
        ids = {"booking_id": booking.id, "version": booking.version}
        logger.info(message, extra={**ids, **fields})

    def _record_event(
        self, booking: Booking, action: str, actor_name: str, summary: str
    ) -> None:
        event = BookingEvent(
            booking=booking, action=action, actor_name=actor_name, summary=summary
        )
        self.bookings.add(event)

    def _describe(self, draft: BookingDraft) -> str:
        equipment = self.equipment.get_many(draft.equipment_ids)
        names = ", ".join(sorted(item.name for item in equipment))
        span = TimeSpan(draft.starts_at, draft.ends_at)
        return f"{names}, {describe_span(span, self.studio_zone)}"

    def _commit(self, draft: BookingDraft, excluded_booking_id: int | None) -> None:
        """Save, turning a lost race against another booking into a 409."""
        try:
            self.session.commit()
        except IntegrityError as error:
            self.session.rollback()
            if not is_overlap_violation(error):
                raise
            # Another request saved an overlapping booking between our
            # conflict check and this commit; the database caught it.
            fields = {"equipment_ids": draft.equipment_ids}
            logger.warning("Database blocked a racing double booking", extra=fields)
            self.conflict_checker.raise_if_conflicts(
                draft.equipment_ids, draft.starts_at, draft.ends_at, excluded_booking_id
            )
            raise
