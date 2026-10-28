"""Small helpers that keep the tests short and readable."""

from typing import Any

from fastapi.testclient import TestClient
from httpx2 import Response

CAMERA_A = 1
CAMERA_B = 2
CAMERA_C = 3
LIGHTING_KIT_1 = 4
LIGHTING_KIT_2 = 5
PODCAST_ROOM = 8

DEFAULT_BOOKING: dict[str, Any] = {
    "booker_name": "Sam K",
    "purpose": "Interview",
    "equipment_ids": [CAMERA_A],
    "starts_at": "2026-10-29T13:00",
    "ends_at": "2026-10-29T15:00",
}


def build_booking(**overrides: Any) -> dict[str, Any]:
    return {**DEFAULT_BOOKING, **overrides}


def create_booking(client: TestClient, **overrides: Any) -> Response:
    return client.post("/api/bookings", json=build_booking(**overrides))


def create_booking_ok(client: TestClient, **overrides: Any) -> dict[str, Any]:
    """Create a booking and fail the test if it wasn't saved."""
    response = create_booking(client, **overrides)
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


def update_booking(
    client: TestClient, booking: dict[str, Any], **overrides: Any
) -> Response:
    """Save `booking` with some fields changed, using the version it was loaded at."""
    item_ids = [item["equipment_id"] for item in booking["items"]]
    payload = {
        "booker_name": booking["booker_name"],
        "purpose": booking["purpose"],
        "equipment_ids": item_ids,
        "starts_at": booking["starts_at"],
        "ends_at": booking["ends_at"],
        "version": booking["version"],
    }
    payload.update(overrides)
    return client.put(f"/api/bookings/{booking['id']}", json=payload)


def cancel_booking(client: TestClient, booking: dict[str, Any]) -> Response:
    payload = {"actor_name": booking["booker_name"], "version": booking["version"]}
    return client.post(f"/api/bookings/{booking['id']}/cancel", json=payload)
