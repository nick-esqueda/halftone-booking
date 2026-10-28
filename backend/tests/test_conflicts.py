"""Double-booking rules: which overlaps are blocked and which aren't."""

import pytest
from fastapi.testclient import TestClient

from tests.helpers import (
    CAMERA_A,
    CAMERA_B,
    LIGHTING_KIT_1,
    cancel_booking,
    create_booking,
    create_booking_ok,
    update_booking,
)

# Existing booking for every test here: Camera A, Thu 13:00-15:00.
EXISTING_START = "2026-10-29T13:00"
EXISTING_END = "2026-10-29T15:00"


@pytest.fixture
def existing(client: TestClient) -> dict[str, object]:
    return create_booking_ok(
        client, booker_name="Ana", starts_at=EXISTING_START, ends_at=EXISTING_END
    )


@pytest.mark.parametrize(
    ("starts_at", "ends_at"),
    [
        ("2026-10-29T13:00", "2026-10-29T15:00"),  # exactly the same
        ("2026-10-29T12:00", "2026-10-29T13:15"),  # overlaps the start
        ("2026-10-29T14:45", "2026-10-29T16:00"),  # overlaps the end
        ("2026-10-29T13:30", "2026-10-29T14:00"),  # inside
        ("2026-10-29T12:00", "2026-10-29T16:00"),  # around
    ],
)
def test_overlapping_booking_is_rejected(
    client: TestClient, existing: dict[str, object], starts_at: str, ends_at: str
) -> None:
    response = create_booking(client, starts_at=starts_at, ends_at=ends_at)

    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "conflict"
    assert body["conflicts"][0]["booker_name"] == "Ana"
    assert body["message"].startswith("Camera A is already booked by Ana")


@pytest.mark.parametrize(
    ("starts_at", "ends_at"),
    [
        ("2026-10-29T11:00", "2026-10-29T13:00"),  # ends as it starts
        ("2026-10-29T15:00", "2026-10-29T17:00"),  # starts as it ends
    ],
)
def test_back_to_back_bookings_are_allowed(
    client: TestClient, existing: dict[str, object], starts_at: str, ends_at: str
) -> None:
    response = create_booking(client, starts_at=starts_at, ends_at=ends_at)
    assert response.status_code == 201, response.text


def test_other_equipment_at_same_time_is_allowed(
    client: TestClient, existing: dict[str, object]
) -> None:
    response = create_booking(client, equipment_ids=[CAMERA_B])
    assert response.status_code == 201


def test_multi_item_booking_is_all_or_nothing(
    client: TestClient, existing: dict[str, object]
) -> None:
    response = create_booking(client, equipment_ids=[CAMERA_B, CAMERA_A])

    assert response.status_code == 409
    camera_b_slots = get_busy_slots(client, CAMERA_B)
    assert camera_b_slots == []


def test_every_clash_is_listed(client: TestClient, existing: dict[str, object]) -> None:
    create_booking_ok(client, booker_name="Jo", equipment_ids=[LIGHTING_KIT_1])

    response = create_booking(client, equipment_ids=[CAMERA_A, LIGHTING_KIT_1])

    clashing_names = {
        conflict["booker_name"] for conflict in response.json()["conflicts"]
    }
    assert clashing_names == {"Ana", "Jo"}


def test_cancelling_frees_the_slot(
    client: TestClient, existing: dict[str, object]
) -> None:
    cancel_booking(client, existing)
    response = create_booking(client)
    assert response.status_code == 201


def test_moving_a_booking_over_its_own_old_slot_is_allowed(
    client: TestClient, existing: dict[str, object]
) -> None:
    response = update_booking(
        client, existing, starts_at="2026-10-29T14:00", ends_at="2026-10-29T16:00"
    )
    assert response.status_code == 200, response.text


def test_editing_into_a_clash_is_rejected_and_nothing_changes(
    client: TestClient, existing: dict[str, object]
) -> None:
    other = create_booking_ok(
        client,
        equipment_ids=[CAMERA_B],
        starts_at="2026-10-29T16:00",
        ends_at="2026-10-29T17:00",
    )

    response = update_booking(
        client, other, equipment_ids=[CAMERA_A], starts_at="2026-10-29T14:00"
    )

    assert response.status_code == 409
    reloaded = client.get(f"/api/bookings/{other['id']}").json()
    assert reloaded == other


def test_dropping_an_item_frees_it(
    client: TestClient, existing: dict[str, object]
) -> None:
    booking_with_two = update_booking(
        client, existing, equipment_ids=[CAMERA_A, CAMERA_B]
    )
    update_booking(client, booking_with_two.json(), equipment_ids=[CAMERA_A])

    response = create_booking(client, equipment_ids=[CAMERA_B])

    assert response.status_code == 201


def get_busy_slots(client: TestClient, equipment_id: int) -> list[dict[str, object]]:
    response = client.get(
        "/api/availability",
        params={"starts_at": "2026-10-29T00:00", "ends_at": "2026-10-30T00:00"},
    )
    rows = response.json()["equipment"]
    matching_row = next(row for row in rows if row["equipment"]["id"] == equipment_id)
    busy_slots: list[dict[str, object]] = matching_row["busy"]
    return busy_slots
