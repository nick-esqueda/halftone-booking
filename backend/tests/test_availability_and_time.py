"""Availability queries, bookings under way, and daylight-saving changes."""

from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient

from tests.conftest import FixedClock
from tests.helpers import (
    CAMERA_A,
    CAMERA_B,
    create_booking,
    create_booking_ok,
    update_booking,
)

ZONE = ZoneInfo("America/Chicago")
THURSDAY = {"starts_at": "2026-10-29T00:00", "ends_at": "2026-10-30T00:00"}


def get_rows_by_name(
    client: TestClient, **params: object
) -> dict[str, dict[str, object]]:
    response = client.get("/api/availability", params={**THURSDAY, **params})
    assert response.status_code == 200, response.text
    return {row["equipment"]["name"]: row for row in response.json()["equipment"]}


def test_availability_lists_every_item_and_its_busy_slots(client: TestClient) -> None:
    booking = create_booking_ok(client, booker_name="Ana", purpose="Shoot")

    rows = get_rows_by_name(client)

    assert len(rows) == 8
    assert rows["Camera B"]["is_free"] is True
    assert rows["Camera A"]["is_free"] is False
    assert rows["Camera A"]["busy"] == [
        {
            "booking_id": booking["id"],
            "booker_name": "Ana",
            "purpose": "Shoot",
            "starts_at": "2026-10-29T13:00:00-05:00",
            "ends_at": "2026-10-29T15:00:00-05:00",
        }
    ]


def test_availability_can_leave_out_the_booking_being_edited(
    client: TestClient,
) -> None:
    booking = create_booking_ok(client)
    rows = get_rows_by_name(client, excluded_booking_id=booking["id"])
    assert rows["Camera A"]["is_free"] is True


def test_availability_hides_cancelled_bookings(client: TestClient) -> None:
    booking = create_booking_ok(client)
    client.post(
        f"/api/bookings/{booking['id']}/cancel",
        json={"actor_name": "Sam K", "version": booking["version"]},
    )
    assert get_rows_by_name(client)["Camera A"]["is_free"] is True


def test_availability_rejects_backwards_range(client: TestClient) -> None:
    response = client.get(
        "/api/availability",
        params={"starts_at": "2026-10-30T00:00", "ends_at": "2026-10-29T00:00"},
    )
    assert response.status_code == 422


def test_multi_day_booking_shows_on_each_day(client: TestClient) -> None:
    create_booking_ok(
        client,
        equipment_ids=[CAMERA_B],
        starts_at="2026-10-29T09:00",
        ends_at="2026-10-31T18:00",
    )
    friday = {"starts_at": "2026-10-30T00:00", "ends_at": "2026-10-31T00:00"}
    rows = get_rows_by_name(client, **friday)
    assert rows["Camera B"]["is_free"] is False


def test_booking_across_fall_back_change_keeps_real_length(client: TestClient) -> None:
    """Nov 1 00:00 to 04:00 Central is five real hours, because 1 AM happens twice."""
    booking = create_booking_ok(
        client, starts_at="2026-11-01T00:00", ends_at="2026-11-01T04:00"
    )

    starts_at = datetime.fromisoformat(booking["starts_at"])
    ends_at = datetime.fromisoformat(booking["ends_at"])
    assert (ends_at - starts_at).total_seconds() == 5 * 3600
    assert booking["starts_at"] == "2026-11-01T00:00:00-05:00"
    assert booking["ends_at"] == "2026-11-01T04:00:00-06:00"


def test_time_skipped_by_spring_forward_is_rejected(client: TestClient) -> None:
    response = create_booking(
        client, starts_at="2027-03-14T02:30", ends_at="2027-03-14T04:00"
    )
    assert response.status_code == 422
    assert response.json()["code"] == "nonexistent_time"


def test_booking_under_way_can_be_extended_but_not_moved(
    client: TestClient, clock: FixedClock
) -> None:
    clock.current = datetime(2026, 10, 27, 9, 0, tzinfo=ZONE)
    booking = create_booking_ok(
        client, starts_at="2026-10-27T10:00", ends_at="2026-10-27T12:00"
    )
    clock.current = datetime(2026, 10, 27, 10, 30, tzinfo=ZONE)

    moved = update_booking(client, booking, starts_at="2026-10-27T10:15")
    extended = update_booking(client, booking, ends_at="2026-10-27T13:00")

    assert moved.json()["code"] == "start_locked"
    assert extended.status_code == 200, extended.text


def test_finished_booking_cannot_be_cancelled(
    client: TestClient, clock: FixedClock
) -> None:
    booking = create_booking_ok(client, equipment_ids=[CAMERA_A])
    clock.current = datetime(2026, 10, 29, 16, 0, tzinfo=ZONE)

    response = client.post(
        f"/api/bookings/{booking['id']}/cancel",
        json={"actor_name": "Sam K", "version": booking["version"]},
    )

    assert response.json()["code"] == "booking_finished"
