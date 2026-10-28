"""Finding free gaps, the arithmetic behind the assistant's suggested times."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.assistant.free_time import find_free_spans, round_up_to_step
from app.services.booking_times import TimeSpan

ZONE = ZoneInfo("America/Chicago")
ONE_HOUR = timedelta(hours=1)


def at(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 10, 29, hour, minute, tzinfo=ZONE)


def span(start_hour: int, end_hour: int) -> TimeSpan:
    return TimeSpan(starts_at=at(start_hour), ends_at=at(end_hour))


WORKDAY = span(9, 17)


def test_a_day_with_nothing_booked_is_one_free_span() -> None:
    assert find_free_spans(WORKDAY, [], ONE_HOUR) == [WORKDAY]


def test_bookings_split_the_day() -> None:
    busy = [span(13, 14), span(10, 11)]
    assert find_free_spans(WORKDAY, busy, ONE_HOUR) == [
        span(9, 10),
        span(11, 13),
        span(14, 17),
    ]


def test_overlapping_bookings_count_once() -> None:
    busy = [span(10, 13), span(11, 12), span(12, 14)]
    assert find_free_spans(WORKDAY, busy, ONE_HOUR) == [span(9, 10), span(14, 17)]


def test_bookings_past_the_window_edges_are_clipped() -> None:
    busy = [span(7, 10), span(16, 20)]
    assert find_free_spans(WORKDAY, busy, ONE_HOUR) == [span(10, 16)]


def test_gaps_shorter_than_the_minimum_are_left_out() -> None:
    busy = [TimeSpan(starts_at=at(9, 30), ends_at=at(12)), span(13, 17)]
    assert find_free_spans(WORKDAY, busy, ONE_HOUR) == [span(12, 13)]


def test_a_fully_booked_day_has_no_free_spans() -> None:
    assert find_free_spans(WORKDAY, [span(8, 18)], ONE_HOUR) == []


def test_rounding_up_to_the_booking_step() -> None:
    assert round_up_to_step(at(10, 7), 15) == at(10, 15)
    assert round_up_to_step(at(10, 15), 15) == at(10, 15)
    assert round_up_to_step(at(10, 50), 15) == at(11)
    assert round_up_to_step(at(10) + timedelta(seconds=1), 15) == at(10, 15)
