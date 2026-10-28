"""Which items are free, and who holds the others, over a time range."""

import logging
from collections import defaultdict
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.config import Settings
from app.errors import InvalidBookingError
from app.models import BookingItem, Equipment
from app.repositories.booking_repository import BookingRepository, build_period
from app.repositories.equipment_repository import EquipmentRepository
from app.schemas import (
    AvailabilityResponse,
    BusySlotResponse,
    EquipmentAvailabilityResponse,
    EquipmentResponse,
)
from app.services.booking_times import get_item_span
from app.studio_time import convert_to_studio_time, convert_to_utc

MAX_AVAILABILITY_RANGE_DAYS = 62

logger = logging.getLogger(__name__)


class AvailabilityService:
    def __init__(self, session: Session, settings: Settings) -> None:
        self.studio_zone = ZoneInfo(settings.studio_timezone)
        self.bookings = BookingRepository(session)
        self.equipment = EquipmentRepository(session)

    def get_availability(
        self,
        starts_at: datetime,
        ends_at: datetime,
        excluded_booking_id: int | None = None,
    ) -> AvailabilityResponse:
        """Busy slots per item; `excluded_booking_id` hides a booking being edited."""
        range_start = convert_to_utc(starts_at, self.studio_zone)
        range_end = convert_to_utc(ends_at, self.studio_zone)
        self._validate_range(range_start, range_end)

        period = build_period(range_start, range_end)
        busy_items = self.bookings.list_active_items_overlapping(period)
        visible_items = [
            item for item in busy_items if item.booking_id != excluded_booking_id
        ]
        items_by_equipment = self._group_by_equipment(visible_items)
        fields = {
            "starts_at": range_start.isoformat(),
            "ends_at": range_end.isoformat(),
            "busy_item_count": len(visible_items),
            "excluded_booking_id": excluded_booking_id,
        }
        logger.debug("Availability looked up", extra=fields)

        equipment_rows = [
            self._build_equipment_row(equipment, items_by_equipment[equipment.id])
            for equipment in self.equipment.list_active()
        ]
        return AvailabilityResponse(
            starts_at=convert_to_studio_time(range_start, self.studio_zone),
            ends_at=convert_to_studio_time(range_end, self.studio_zone),
            equipment=equipment_rows,
        )

    def _validate_range(self, range_start: datetime, range_end: datetime) -> None:
        if range_end <= range_start:
            raise InvalidBookingError(
                "end_before_start", "The end time must be after the start time."
            )
        if (range_end - range_start).days > MAX_AVAILABILITY_RANGE_DAYS:
            raise InvalidBookingError(
                "range_too_long", "Ask for at most two months at a time."
            )

    def _group_by_equipment(
        self, items: list[BookingItem]
    ) -> dict[int, list[BookingItem]]:
        items_by_equipment: dict[int, list[BookingItem]] = defaultdict(list)
        for item in items:
            items_by_equipment[item.equipment_id].append(item)
        return items_by_equipment

    def _build_equipment_row(
        self, equipment: Equipment, busy_items: list[BookingItem]
    ) -> EquipmentAvailabilityResponse:
        busy_slots = [self._build_busy_slot(item) for item in busy_items]
        return EquipmentAvailabilityResponse(
            equipment=EquipmentResponse.model_validate(equipment),
            is_free=not busy_slots,
            busy=busy_slots,
        )

    def _build_busy_slot(self, item: BookingItem) -> BusySlotResponse:
        span = get_item_span(item)
        return BusySlotResponse(
            booking_id=item.booking_id,
            booker_name=item.booking.booker_name,
            purpose=item.booking.purpose,
            starts_at=convert_to_studio_time(span.starts_at, self.studio_zone),
            ends_at=convert_to_studio_time(span.ends_at, self.studio_zone),
        )
