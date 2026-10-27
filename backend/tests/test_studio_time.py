"""Studio time conversion, including the daylight-saving edge cases."""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import pytest

from app.errors import InvalidBookingError
from app.studio_time import convert_to_utc, is_on_time_step

ZONE = ZoneInfo("America/Chicago")


def test_time_without_offset_is_studio_time() -> None:
    result = convert_to_utc(datetime(2026, 10, 29, 13, 0), ZONE)
    assert result == datetime(2026, 10, 29, 18, 0, tzinfo=UTC)


def test_time_with_offset_is_kept() -> None:
    eastern = ZoneInfo("America/New_York")
    result = convert_to_utc(datetime(2026, 10, 29, 13, 0, tzinfo=eastern), ZONE)
    assert result == datetime(2026, 10, 29, 17, 0, tzinfo=UTC)


def test_time_skipped_by_spring_forward_is_rejected() -> None:
    with pytest.raises(InvalidBookingError) as error:
        convert_to_utc(datetime(2027, 3, 14, 2, 30), ZONE)
    assert error.value.code == "nonexistent_time"


def test_repeated_fall_back_time_means_first_occurrence() -> None:
    result = convert_to_utc(datetime(2026, 11, 1, 1, 30), ZONE)
    first_occurrence_in_daylight_time = datetime(2026, 11, 1, 6, 30, tzinfo=UTC)
    assert result == first_occurrence_in_daylight_time


@pytest.mark.parametrize(
    ("minute", "second", "is_expected_on_step"),
    [(0, 0, True), (15, 0, True), (45, 0, True), (10, 0, False), (15, 1, False)],
)
def test_time_step(minute: int, second: int, is_expected_on_step: bool) -> None:
    value = datetime(2026, 10, 29, 13, minute, second, tzinfo=ZONE)
    assert is_on_time_step(value, ZONE, 15) is is_expected_on_step
