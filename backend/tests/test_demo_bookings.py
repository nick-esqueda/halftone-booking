"""Demo bookings: added once to an empty database, and they follow the booking rules."""

import random
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.config import Settings, get_settings
from app.demo_bookings import DEMO_BOOKER_NAMES, seed_demo_bookings
from app.models import Booking
from app.services.booking_times import get_booking_span
from tests.conftest import DEFAULT_NOW, STUDIO_ZONE, FixedClock

# A fixed seed keeps the planned schedule the same on every test run.
TEST_RANDOM_SEED = 1234


def run_demo_seed(session: Session) -> int:
    clock = FixedClock(DEFAULT_NOW)
    rng = random.Random(TEST_RANDOM_SEED)
    return seed_demo_bookings(session, get_settings(), clock, rng)


def load_bookings(session: Session) -> list[Booking]:
    query = select(Booking).options(selectinload(Booking.items))
    return list(session.scalars(query))


def test_seeds_bookings_from_the_demo_names(session: Session) -> None:
    added_count = run_demo_seed(session)

    bookings = load_bookings(session)
    booker_names = {booking.booker_name for booking in bookings}
    assert added_count == len(bookings)
    assert added_count > 50
    assert booker_names <= set(DEMO_BOOKER_NAMES)


def test_bookings_stay_within_the_next_two_months(session: Session) -> None:
    run_demo_seed(session)

    days_ahead = get_settings().demo_booking_days_ahead
    last_allowed_end = DEFAULT_NOW + timedelta(days=days_ahead + 1)
    max_length = timedelta(days=get_settings().max_booking_days)
    for booking in load_bookings(session):
        span = get_booking_span(booking)
        assert DEFAULT_NOW - timedelta(minutes=5) <= span.starts_at
        assert span.ends_at <= last_allowed_end
        assert span.ends_at - span.starts_at <= max_length


def test_includes_multi_day_bookings(session: Session) -> None:
    run_demo_seed(session)

    spans = [get_booking_span(booking) for booking in load_bookings(session)]
    multi_day_spans = [
        span
        for span in spans
        if span.starts_at.astimezone(STUDIO_ZONE).date()
        != span.ends_at.astimezone(STUDIO_ZONE).date()
    ]
    assert len(multi_day_spans) >= 3


def test_does_nothing_when_bookings_exist(session: Session) -> None:
    run_demo_seed(session)
    count_after_first_run = len(load_bookings(session))

    added_count = run_demo_seed(session)

    assert added_count == 0
    assert len(load_bookings(session)) == count_after_first_run


def test_demo_bookings_are_off_by_default() -> None:
    assert Settings().seed_demo_bookings is False
