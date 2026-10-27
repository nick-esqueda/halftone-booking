"""Randomized check of the overlap rules against a simple reference model.

Hypothesis generates many sequences of booking requests. For each request,
the reference model decides whether it should succeed (no overlap with an
earlier accepted booking of the same item). The API must agree every time.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from sqlalchemy import text

from app.db import get_engine
from tests.helpers import CAMERA_A, CAMERA_B, CAMERA_C, create_booking

ZONE = ZoneInfo("America/Chicago")
DAY_START = datetime(2026, 10, 29, 8, 0, tzinfo=ZONE)
STEP = timedelta(minutes=15)
SLOTS_IN_DAY = 48
MAX_LENGTH_IN_STEPS = 12
EXAMPLE_COUNT = 40


@dataclass(frozen=True)
class Request:
    equipment_id: int
    start_step: int
    length_in_steps: int

    @property
    def end_step(self) -> int:
        return self.start_step + self.length_in_steps


requests_strategy = st.lists(
    st.builds(
        Request,
        equipment_id=st.sampled_from([CAMERA_A, CAMERA_B, CAMERA_C]),
        start_step=st.integers(min_value=0, max_value=SLOTS_IN_DAY),
        length_in_steps=st.integers(min_value=1, max_value=MAX_LENGTH_IN_STEPS),
    ),
    min_size=1,
    max_size=15,
)


def overlaps(first: Request, second: Request) -> bool:
    is_same_item = first.equipment_id == second.equipment_id
    return (
        is_same_item
        and first.start_step < second.end_step
        and second.start_step < first.end_step
    )


def to_iso(step: int) -> str:
    return (DAY_START + step * STEP).isoformat()


def clear_bookings() -> None:
    with get_engine().begin() as connection:
        connection.execute(
            text("TRUNCATE booking_events, booking_items, bookings CASCADE")
        )


@settings(
    max_examples=EXAMPLE_COUNT,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(requests=requests_strategy)
def test_api_matches_reference_model(
    client: TestClient, requests: list[Request]
) -> None:
    clear_bookings()
    accepted: list[Request] = []

    for request in requests:
        should_succeed = not any(overlaps(request, earlier) for earlier in accepted)
        response = create_booking(
            client,
            equipment_ids=[request.equipment_id],
            starts_at=to_iso(request.start_step),
            ends_at=to_iso(request.end_step),
        )

        expected_status = 201 if should_succeed else 409
        assert response.status_code == expected_status, (request, response.text)
        if should_succeed:
            accepted.append(request)
