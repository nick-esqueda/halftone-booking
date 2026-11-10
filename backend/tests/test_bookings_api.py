"""The booking endpoints: create, read, list, edit, cancel and history."""

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


def test_create_returns_booking_in_studio_time(client: TestClient) -> None:
    booking = create_booking_ok(client, equipment_ids=[CAMERA_A, LIGHTING_KIT_1])

    assert booking["starts_at"] == "2026-10-29T13:00:00-05:00"
    assert booking["ends_at"] == "2026-10-29T15:00:00-05:00"
    item_names = [item["equipment_name"] for item in booking["items"]]
    assert item_names == ["Camera A", "Lighting Kit 1"]
    assert booking["version"] == 1
    assert booking["is_cancelled"] is False


def test_names_are_trimmed(client: TestClient) -> None:
    booking = create_booking_ok(client, booker_name="  Sam   K ")
    assert booking["booker_name"] == "Sam K"


def test_get_booking(client: TestClient) -> None:
    booking = create_booking_ok(client)
    response = client.get(f"/api/bookings/{booking['id']}")
    assert response.status_code == 200
    assert response.json() == booking


def test_missing_booking_is_404(client: TestClient) -> None:
    response = client.get("/api/bookings/999")
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


def test_list_by_name_ignores_case(client: TestClient) -> None:
    create_booking_ok(client, booker_name="Sam K")
    create_booking_ok(client, booker_name="Ana", equipment_ids=[CAMERA_B])

    response = client.get("/api/bookings", params={"booker_name": "sam k"})

    names = [booking["booker_name"] for booking in response.json()]
    assert names == ["Sam K"]


def test_update_changes_time_items_and_version(client: TestClient) -> None:
    booking = create_booking_ok(client)

    response = update_booking(
        client,
        booking,
        equipment_ids=[CAMERA_B, LIGHTING_KIT_1],
        ends_at="2026-10-29T17:00",
        purpose="Longer shoot",
    )

    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["ends_at"] == "2026-10-29T17:00:00-05:00"
    assert [item["equipment_id"] for item in updated["items"]] == [
        CAMERA_B,
        LIGHTING_KIT_1,
    ]
    assert updated["purpose"] == "Longer shoot"
    assert updated["version"] == 2


def test_stale_version_is_refused(client: TestClient) -> None:
    booking = create_booking_ok(client)
    assert update_booking(client, booking, purpose="First edit").status_code == 200

    response = update_booking(client, booking, purpose="Second edit, stale")

    assert response.status_code == 409
    assert response.json()["code"] == "stale_version"


def test_cancel(client: TestClient) -> None:
    booking = create_booking_ok(client)

    response = cancel_booking(client, booking)

    assert response.status_code == 200
    cancelled = response.json()
    assert cancelled["is_cancelled"] is True
    assert cancelled["items"][0]["equipment_id"] == CAMERA_A


def test_cancelled_booking_cannot_be_edited_or_cancelled_again(
    client: TestClient,
) -> None:
    booking = create_booking_ok(client)
    cancelled = cancel_booking(client, booking).json()

    assert update_booking(client, cancelled).json()["code"] == "booking_cancelled"
    assert cancel_booking(client, cancelled).json()["code"] == "booking_cancelled"


def test_history_records_every_change(client: TestClient) -> None:
    booking = create_booking_ok(client)
    updated = update_booking(client, booking, booker_name="Sam K").json()
    cancel_booking(client, updated)

    history = client.get(f"/api/bookings/{booking['id']}/history").json()

    assert [event["action"] for event in history] == ["created", "updated", "cancelled"]
    assert (
        history[0]["summary"] == "Camera A, Thu Oct 29, 1:00 PM to Thu Oct 29, 3:00 PM"
    )


def test_bad_request_uses_shared_error_shape(client: TestClient) -> None:
    response = create_booking(client, equipment_ids=[])
    body = response.json()
    assert response.status_code == 422
    assert body["code"] == "invalid_request"
    assert body["conflicts"] == []


def test_rule_errors_are_422(client: TestClient) -> None:
    response = create_booking(client, starts_at="2026-10-29T13:10")
    assert response.status_code == 422
    assert response.json()["code"] == "off_time_step"


def test_booking_longer_than_a_week_is_refused(client: TestClient) -> None:
    response = create_booking(
        client, starts_at="2026-10-29T09:00", ends_at="2026-11-05T09:15"
    )
    assert response.status_code == 422
    assert response.json()["code"] == "booking_too_long"


def test_editing_a_booking_past_a_week_is_refused(client: TestClient) -> None:
    booking = create_booking_ok(
        client, starts_at="2026-10-29T09:00", ends_at="2026-11-05T09:00"
    )
    response = update_booking(client, booking, ends_at="2026-11-06T09:00")
    assert response.json()["code"] == "booking_too_long"


def test_studio_config(client: TestClient) -> None:
    config = client.get("/api/config").json()
    assert config == {
        "timezone": "America/Chicago",
        "time_step_minutes": 15,
        "assistant_enabled": False,
    }


def test_booking_shows_the_users_spelling(client: TestClient) -> None:
    booking = create_booking_ok(client, booker_name="susie")
    assert booking["booker_name"] == "Susie"


def test_booking_for_someone_who_is_not_a_user_is_refused(
    client: TestClient,
) -> None:
    response = create_booking(client, booker_name="Nobody Here")

    assert response.status_code == 422
    assert response.json()["code"] == "unknown_user"
    assert (
        client.get("/api/bookings", params={"booker_name": "Nobody Here"}).json() == []
    )


def test_anyone_can_edit_someone_elses_booking(client: TestClient) -> None:
    booking = create_booking_ok(client, booker_name="Susie")

    response = update_booking(client, booking, purpose="Reshoot", actor_name="Eric")

    assert response.status_code == 200
    assert response.json()["booker_name"] == "Susie"
    history = client.get(f"/api/bookings/{booking['id']}/history").json()
    assert [event["actor_name"] for event in history] == ["Susie", "Eric"]


def test_anyone_can_cancel_someone_elses_booking(client: TestClient) -> None:
    booking = create_booking_ok(client, booker_name="Susie")
    payload = {"actor_name": "Eric", "version": booking["version"]}

    response = client.post(f"/api/bookings/{booking['id']}/cancel", json=payload)

    assert response.status_code == 200
    history = client.get(f"/api/bookings/{booking['id']}/history").json()
    assert history[-1]["action"] == "cancelled"
    assert history[-1]["actor_name"] == "Eric"


def test_changes_by_someone_who_is_not_a_user_are_refused(
    client: TestClient,
) -> None:
    booking = create_booking_ok(client, booker_name="Susie")
    cancel_payload = {"actor_name": "Nobody Here", "version": booking["version"]}

    edit = update_booking(client, booking, actor_name="Nobody Here")
    cancel = client.post(f"/api/bookings/{booking['id']}/cancel", json=cancel_payload)

    assert edit.status_code == 422
    assert cancel.status_code == 422
    assert client.get(f"/api/bookings/{booking['id']}").json()["version"] == 1


def test_changing_booked_by_moves_the_booking(client: TestClient) -> None:
    booking = create_booking_ok(client, booker_name="Susie")

    update_booking(client, booking, booker_name="Eric")

    susies = client.get("/api/bookings", params={"booker_name": "Susie"}).json()
    erics = client.get("/api/bookings", params={"booker_name": "eric"}).json()
    assert susies == []
    assert [found["id"] for found in erics] == [booking["id"]]
