"""Randomized check of creating, editing and cancelling against a simple model.

Hypothesis runs random sequences of creates, edits (new times and items) and
cancels. A plain-Python model decides what each step should do: a step
succeeds only if none of its items overlaps another active booking. After
every step, the API's availability must match the model exactly.

To add an action: write a `@rule` that works out the expected outcome from
`self.bookings`, calls the API, checks the status and updates the model.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from hypothesis import HealthCheck, settings
from hypothesis import strategies as st
from hypothesis.stateful import (
    RuleBasedStateMachine,
    invariant,
    precondition,
    rule,
    run_state_machine_as_test,
)
from sqlalchemy import text

from app.db import get_engine
from tests.helpers import CAMERA_A, CAMERA_B, CAMERA_C, build_booking

ZONE = ZoneInfo("America/Chicago")
DAY_START = datetime(2026, 10, 29, 8, 0, tzinfo=ZONE)
DAY_RANGE = {"starts_at": "2026-10-29T00:00", "ends_at": "2026-10-30T00:00"}
STEP = timedelta(minutes=15)
EQUIPMENT_IDS = [CAMERA_A, CAMERA_B, CAMERA_C]
LAST_START_STEP = 48
MAX_LENGTH_IN_STEPS = 12
EXAMPLE_COUNT = 30
STEPS_PER_EXAMPLE = 25

start_steps = st.integers(min_value=0, max_value=LAST_START_STEP)
lengths = st.integers(min_value=1, max_value=MAX_LENGTH_IN_STEPS)
item_sets = st.sets(st.sampled_from(EQUIPMENT_IDS), min_size=1).map(sorted)


@dataclass
class ModelBooking:
    equipment_ids: list[int]
    start_step: int
    end_step: int
    version: int = 1
    is_cancelled: bool = field(default=False)

    def overlaps(self, equipment_ids: list[int], start: int, end: int) -> bool:
        shares_an_item = bool(set(self.equipment_ids) & set(equipment_ids))
        return shares_an_item and self.start_step < end and start < self.end_step


def to_iso(step: int) -> str:
    return (DAY_START + step * STEP).isoformat()


def to_step(value: str) -> int:
    return int((datetime.fromisoformat(value) - DAY_START) / STEP)


def clear_bookings() -> None:
    with get_engine().begin() as connection:
        connection.execute(
            text("TRUNCATE booking_events, booking_items, bookings CASCADE")
        )


class BookingMachine(RuleBasedStateMachine):
    def __init__(self, client: TestClient) -> None:
        super().__init__()
        clear_bookings()
        self.client = client
        self.bookings: dict[int, ModelBooking] = {}

    def _is_free(
        self, equipment_ids: list[int], start: int, end: int, ignored_id: int = 0
    ) -> bool:
        return not any(
            booking.overlaps(equipment_ids, start, end)
            for booking_id, booking in self.bookings.items()
            if booking_id != ignored_id and not booking.is_cancelled
        )

    def _active_ids(self) -> list[int]:
        return [
            id_ for id_, booking in self.bookings.items() if not booking.is_cancelled
        ]

    def _check_status(self, response: Any, should_succeed: bool, ok: int) -> None:
        expected_status = ok if should_succeed else 409
        assert response.status_code == expected_status, response.text

    @rule(equipment_ids=item_sets, start=start_steps, length=lengths)
    def create(self, equipment_ids: list[int], start: int, length: int) -> None:
        end = start + length
        should_succeed = self._is_free(equipment_ids, start, end)
        payload = build_booking(
            equipment_ids=equipment_ids, starts_at=to_iso(start), ends_at=to_iso(end)
        )

        response = self.client.post("/api/bookings", json=payload)

        self._check_status(response, should_succeed, ok=201)
        if should_succeed:
            booking_id = response.json()["id"]
            self.bookings[booking_id] = ModelBooking(equipment_ids, start, end)

    @precondition(lambda self: self._active_ids())
    @rule(data=st.data(), equipment_ids=item_sets, start=start_steps, length=lengths)
    def edit(
        self, data: st.DataObject, equipment_ids: list[int], start: int, length: int
    ) -> None:
        booking_id = data.draw(st.sampled_from(self._active_ids()))
        booking = self.bookings[booking_id]
        end = start + length
        should_succeed = self._is_free(equipment_ids, start, end, booking_id)
        payload = build_booking(
            equipment_ids=equipment_ids,
            starts_at=to_iso(start),
            ends_at=to_iso(end),
            version=booking.version,
        )

        response = self.client.put(f"/api/bookings/{booking_id}", json=payload)

        self._check_status(response, should_succeed, ok=200)
        if should_succeed:
            booking.equipment_ids = equipment_ids
            booking.start_step, booking.end_step = start, end
            booking.version += 1

    @precondition(lambda self: self._active_ids())
    @rule(data=st.data())
    def cancel(self, data: st.DataObject) -> None:
        booking_id = data.draw(st.sampled_from(self._active_ids()))
        booking = self.bookings[booking_id]
        payload = {"actor_name": "Sam K", "version": booking.version}

        response = self.client.post(f"/api/bookings/{booking_id}/cancel", json=payload)

        assert response.status_code == 200, response.text
        booking.is_cancelled = True
        booking.version += 1

    @invariant()
    def availability_matches_model(self) -> None:
        response = self.client.get("/api/availability", params=DAY_RANGE)
        busy_by_item = {
            row["equipment"]["id"]: {
                (
                    slot["booking_id"],
                    to_step(slot["starts_at"]),
                    to_step(slot["ends_at"]),
                )
                for slot in row["busy"]
            }
            for row in response.json()["equipment"]
        }

        for equipment_id in EQUIPMENT_IDS:
            expected = {
                (booking_id, booking.start_step, booking.end_step)
                for booking_id, booking in self.bookings.items()
                if not booking.is_cancelled and equipment_id in booking.equipment_ids
            }
            assert busy_by_item[equipment_id] == expected


def test_bookings_match_reference_model(client: TestClient) -> None:
    class MachineWithClient(BookingMachine):
        def __init__(self) -> None:
            super().__init__(client)

    run_state_machine_as_test(
        MachineWithClient,
        settings=settings(
            max_examples=EXAMPLE_COUNT,
            stateful_step_count=STEPS_PER_EXAMPLE,
            deadline=None,
            suppress_health_check=[HealthCheck.function_scoped_fixture],
        ),
    )
