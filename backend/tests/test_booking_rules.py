"""Unit tests for each booking rule, without the database."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.config import Settings
from app.errors import InvalidBookingError
from app.models import Equipment
from app.services.booking_rules import (
    BookingCheckContext,
    BookingDraft,
    OriginalTimes,
    normalize_name,
    validate_booking,
)

ZONE = ZoneInfo("America/Chicago")
NOW = datetime(2026, 10, 27, 10, 30, tzinfo=ZONE)
CAMERA = Equipment(id=1, name="Camera A", category="camera", is_active=True)
RETIRED_CAMERA = Equipment(id=9, name="Old Camera", category="camera", is_active=False)


def build_draft(**overrides: object) -> BookingDraft:
    fields: dict[str, object] = {
        "booker_name": "Sam K",
        "purpose": "",
        "equipment_ids": [CAMERA.id],
        "starts_at": datetime(2026, 10, 29, 13, 0, tzinfo=ZONE),
        "ends_at": datetime(2026, 10, 29, 15, 0, tzinfo=ZONE),
    }
    fields.update(overrides)
    return BookingDraft(**fields)  # type: ignore[arg-type]


def build_context(original_times: OriginalTimes | None = None) -> BookingCheckContext:
    return BookingCheckContext(
        now=NOW,
        settings=Settings(),
        studio_zone=ZONE,
        equipment_by_id={CAMERA.id: CAMERA, RETIRED_CAMERA.id: RETIRED_CAMERA},
        original_times=original_times,
    )


def get_error_code(draft: BookingDraft, context: BookingCheckContext) -> str | None:
    try:
        validate_booking(draft, context)
    except InvalidBookingError as error:
        return error.code
    return None


def test_valid_booking_passes() -> None:
    assert get_error_code(build_draft(), build_context()) is None


@pytest.mark.parametrize(
    ("overrides", "expected_code"),
    [
        ({"booker_name": ""}, "name_required"),
        ({"booker_name": "x" * 81}, "text_too_long"),
        ({"purpose": "x" * 201}, "text_too_long"),
        ({"ends_at": datetime(2026, 10, 29, 13, 0, tzinfo=ZONE)}, "end_before_start"),
        ({"ends_at": datetime(2026, 10, 29, 12, 0, tzinfo=ZONE)}, "end_before_start"),
        ({"starts_at": datetime(2026, 10, 29, 13, 10, tzinfo=ZONE)}, "off_time_step"),
        ({"ends_at": datetime(2026, 10, 29, 15, 0, 30, tzinfo=ZONE)}, "off_time_step"),
        ({"equipment_ids": [CAMERA.id, CAMERA.id]}, "duplicate_item"),
        ({"equipment_ids": [404]}, "unknown_item"),
        ({"equipment_ids": [RETIRED_CAMERA.id]}, "unknown_item"),
        (
            {
                "starts_at": datetime(2026, 10, 27, 9, 0, tzinfo=ZONE),
                "ends_at": datetime(2026, 10, 27, 11, 0, tzinfo=ZONE),
            },
            "start_in_past",
        ),
    ],
)
def test_broken_rule_is_reported(
    overrides: dict[str, object], expected_code: str
) -> None:
    assert get_error_code(build_draft(**overrides), build_context()) == expected_code


def test_start_within_grace_period_is_allowed() -> None:
    draft = build_draft(
        starts_at=datetime(2026, 10, 27, 10, 30, tzinfo=ZONE),
        ends_at=datetime(2026, 10, 27, 11, 0, tzinfo=ZONE),
    )
    almost_now = BookingCheckContext(
        now=NOW + timedelta(minutes=4),
        settings=Settings(),
        studio_zone=ZONE,
        equipment_by_id={CAMERA.id: CAMERA},
    )
    assert get_error_code(draft, almost_now) is None


def test_start_just_past_grace_period_is_rejected() -> None:
    draft = build_draft(
        starts_at=datetime(2026, 10, 27, 10, 15, tzinfo=ZONE),
        ends_at=datetime(2026, 10, 27, 11, 0, tzinfo=ZONE),
    )
    assert get_error_code(draft, build_context()) == "start_in_past"


class TestEditingStartedBooking:
    """Original booking: 10:00-12:00 today; it's 10:30 now."""

    original = OriginalTimes(
        starts_at=datetime(2026, 10, 27, 10, 0, tzinfo=ZONE),
        ends_at=datetime(2026, 10, 27, 12, 0, tzinfo=ZONE),
    )

    def test_extending_is_allowed(self) -> None:
        draft = build_draft(
            starts_at=self.original.starts_at,
            ends_at=datetime(2026, 10, 27, 14, 0, tzinfo=ZONE),
        )
        assert get_error_code(draft, build_context(self.original)) is None

    def test_moving_start_is_rejected(self) -> None:
        draft = build_draft(
            starts_at=datetime(2026, 10, 27, 10, 15, tzinfo=ZONE),
            ends_at=self.original.ends_at,
        )
        assert get_error_code(draft, build_context(self.original)) == "start_locked"

    def test_ending_in_the_past_is_rejected(self) -> None:
        draft = build_draft(
            starts_at=self.original.starts_at,
            ends_at=datetime(2026, 10, 27, 10, 15, tzinfo=ZONE),
        )
        assert get_error_code(draft, build_context(self.original)) == "end_in_past"

    def test_finished_booking_cannot_change(self) -> None:
        finished = OriginalTimes(
            starts_at=datetime(2026, 10, 27, 8, 0, tzinfo=ZONE),
            ends_at=datetime(2026, 10, 27, 9, 0, tzinfo=ZONE),
        )
        draft = build_draft(starts_at=finished.starts_at, ends_at=finished.ends_at)
        assert get_error_code(draft, build_context(finished)) == "booking_finished"


@pytest.mark.parametrize(
    ("raw_name", "expected"),
    [("  Sam   K ", "Sam K"), ("Sam K", "Sam K"), ("   ", "")],
)
def test_normalize_name(raw_name: str, expected: str) -> None:
    assert normalize_name(raw_name) == expected
