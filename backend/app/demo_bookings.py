"""Random demo bookings, so a fresh database has a schedule to look at.

Bookings are only added when the database has none, so restarts don't pile
up duplicates. Every booking goes through `BookingService`, so the demo data
obeys the same rules as real bookings (time step, 7-day cap, no overlaps).
Any planned booking that breaks a rule, for example one that clashes with an
earlier demo booking, is simply skipped.

To add a new kind of demo booking, add a `DemoBookingKind` to
`SINGLE_DAY_KINDS` or `MULTI_DAY_KINDS`.
"""

import logging
import random
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.config import Settings
from app.errors import BookingConflictError, InvalidBookingError
from app.models import Equipment
from app.repositories.booking_repository import BookingRepository
from app.repositories.equipment_repository import EquipmentRepository
from app.schemas import BookingCreateRequest
from app.services.booking_service import BookingService
from app.studio_time import Clock

logger = logging.getLogger(__name__)

DEMO_BOOKER_NAMES: list[str] = [
    "Susie",
    "Eric",
    "Danny",
    "Jordan",
    "Mike",
    "Aidan",
    "Tyler",
    "Morgan",
    "Nick",
    "Priya",
    "Marcus",
    "Lena",
    "Rosa",
    "Theo",
]

# Single-day bookings start between these studio hours.
EARLIEST_START_HOUR = 8
LATEST_START_HOUR = 17

# Single-day bookings last between these many minutes.
SHORTEST_BOOKING_MINUTES = 60
LONGEST_BOOKING_MINUTES = 4 * 60

# How many single-day bookings each day gets, from fewest to most.
WEEKDAY_BOOKING_COUNTS = (1, 4)
WEEKEND_BOOKING_COUNTS = (0, 2)
FIRST_WEEKEND_DAY = 5  # Saturday, counting Monday as 0.

# Multi-day bookings pick up at the start time and return at the end time.
MULTI_DAY_BOOKING_COUNT = 10
MULTI_DAY_START_TIME = time(9, 0)
MULTI_DAY_END_TIME = time(18, 0)
MULTI_DAY_EXTRA_DAYS = (1, 4)


@dataclass(frozen=True)
class DemoBookingKind:
    """One kind of booking: one item from each category, for one of the purposes."""

    categories: tuple[str, ...]
    purposes: tuple[str, ...]


SINGLE_DAY_KINDS: list[DemoBookingKind] = [
    DemoBookingKind(("camera",), ("Interview", "B-roll", "Product photos")),
    DemoBookingKind(("camera", "lighting"), ("Portrait session", "Client shoot")),
    DemoBookingKind(("lighting",), ("Lighting test", "Tabletop shoot")),
    DemoBookingKind(("room",), ("Podcast recording", "Voiceover", "Band rehearsal")),
]

MULTI_DAY_KINDS: list[DemoBookingKind] = [
    DemoBookingKind(("camera", "lighting"), ("Location shoot", "Music video")),
    DemoBookingKind(("camera",), ("Documentary trip", "Wedding weekend")),
]


class DemoBookingPlanner:
    """Plans random bookings from today up to `days_ahead` days out.

    Times are naive studio wall-clock times, which the booking service reads
    as studio time.
    """

    def __init__(
        self,
        equipment: Sequence[Equipment],
        settings: Settings,
        rng: random.Random,
    ) -> None:
        self.settings = settings
        self.rng = rng
        self.equipment_by_category: dict[str, list[Equipment]] = {}
        for item in equipment:
            self.equipment_by_category.setdefault(item.category, []).append(item)

    def plan(self, first_day: date, days_ahead: int) -> list[BookingCreateRequest]:
        """Multi-day bookings come first, so they aren't crowded out by short ones."""
        multi_day = self._plan_multi_day(first_day, days_ahead)
        single_day = self._plan_single_day(first_day, days_ahead)
        return multi_day + single_day

    def _plan_multi_day(
        self, first_day: date, days_ahead: int
    ) -> list[BookingCreateRequest]:
        requests = []
        for _ in range(MULTI_DAY_BOOKING_COUNT):
            start_offset = self.rng.randint(1, days_ahead - MULTI_DAY_EXTRA_DAYS[1])
            start_day = first_day + timedelta(days=start_offset)
            end_day = start_day + timedelta(
                days=self.rng.randint(*MULTI_DAY_EXTRA_DAYS)
            )

            starts_at = datetime.combine(start_day, MULTI_DAY_START_TIME)
            ends_at = datetime.combine(end_day, MULTI_DAY_END_TIME)
            kind = self.rng.choice(MULTI_DAY_KINDS)
            requests.append(self._build_request(kind, starts_at, ends_at))
        return requests

    def _plan_single_day(
        self, first_day: date, days_ahead: int
    ) -> list[BookingCreateRequest]:
        requests = []
        for offset in range(days_ahead + 1):
            day = first_day + timedelta(days=offset)
            for _ in range(self._pick_booking_count(day)):
                requests.append(self._plan_one_day_booking(day))
        return requests

    def _pick_booking_count(self, day: date) -> int:
        is_weekend = day.weekday() >= FIRST_WEEKEND_DAY
        counts = WEEKEND_BOOKING_COUNTS if is_weekend else WEEKDAY_BOOKING_COUNTS
        return self.rng.randint(*counts)

    def _plan_one_day_booking(self, day: date) -> BookingCreateRequest:
        step = self.settings.time_step_minutes
        start_hour = self.rng.randint(EARLIEST_START_HOUR, LATEST_START_HOUR)
        start_minute = self.rng.randrange(0, 60, step)
        duration = self.rng.randrange(
            SHORTEST_BOOKING_MINUTES, LONGEST_BOOKING_MINUTES + 1, step
        )

        starts_at = datetime.combine(day, time(start_hour, start_minute))
        ends_at = starts_at + timedelta(minutes=duration)
        kind = self.rng.choice(SINGLE_DAY_KINDS)
        return self._build_request(kind, starts_at, ends_at)

    def _build_request(
        self, kind: DemoBookingKind, starts_at: datetime, ends_at: datetime
    ) -> BookingCreateRequest:
        equipment_ids = [
            self.rng.choice(self.equipment_by_category[category]).id
            for category in kind.categories
        ]
        return BookingCreateRequest(
            booker_name=self.rng.choice(DEMO_BOOKER_NAMES),
            purpose=self.rng.choice(kind.purposes),
            equipment_ids=equipment_ids,
            starts_at=starts_at,
            ends_at=ends_at,
        )


def seed_demo_bookings(
    session: Session, settings: Settings, clock: Clock, rng: random.Random
) -> int:
    """Add demo bookings if there are none yet; return how many were added."""
    if BookingRepository(session).has_any_bookings():
        logger.info("Skipped demo bookings: the database already has bookings")
        return 0

    equipment = EquipmentRepository(session).list_active()
    planner = DemoBookingPlanner(equipment, settings, rng)
    today = clock.now().astimezone(ZoneInfo(settings.studio_timezone)).date()
    requests = planner.plan(today, settings.demo_booking_days_ahead)

    service = BookingService(session, settings, clock)
    return sum(_try_create(service, request) for request in requests)


def _try_create(service: BookingService, request: BookingCreateRequest) -> bool:
    """Save one planned booking; skip it if it clashes or breaks a rule."""
    try:
        service.create_booking(request)
    except (BookingConflictError, InvalidBookingError):
        return False
    return True
