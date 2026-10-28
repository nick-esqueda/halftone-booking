"""Request IDs on responses and log lines, and what each request logs."""

import logging
import uuid

import pytest
from fastapi.testclient import TestClient

from tests.helpers import build_booking, create_booking, create_booking_ok

CALLER_REQUEST_ID = "web-3f9a1c2e-8b4d"
CALLER_HEADERS = {"X-Request-ID": CALLER_REQUEST_ID}


def find_records(
    caplog: pytest.LogCaptureFixture, message: str
) -> list[logging.LogRecord]:
    return [record for record in caplog.records if record.getMessage() == message]


def test_response_gets_a_new_request_id_when_the_caller_sends_none(
    client: TestClient,
) -> None:
    response = client.get("/api/equipment")

    request_id = response.headers["X-Request-ID"]
    assert str(uuid.UUID(request_id)) == request_id


def test_response_reuses_a_well_formed_caller_request_id(client: TestClient) -> None:
    response = client.get("/api/equipment", headers=CALLER_HEADERS)
    assert response.headers["X-Request-ID"] == CALLER_REQUEST_ID


@pytest.mark.parametrize(
    "bad_id", ["short", "has spaces in it", "x" * 65, "a;b=c-1234"]
)
def test_malformed_caller_request_id_is_replaced(
    client: TestClient, bad_id: str
) -> None:
    response = client.get("/api/equipment", headers={"X-Request-ID": bad_id})
    assert response.headers["X-Request-ID"] != bad_id


def test_error_body_carries_the_request_id(client: TestClient) -> None:
    response = client.get("/api/bookings/999", headers=CALLER_HEADERS)

    assert response.status_code == 404
    assert response.json()["request_id"] == CALLER_REQUEST_ID


def test_every_line_in_a_request_carries_its_id(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    client.post("/api/bookings", json=build_booking(), headers=CALLER_HEADERS)

    app_records = [record for record in caplog.records if record.name.startswith("app")]
    request_ids = {vars(record)["request_id"] for record in app_records}
    assert len(app_records) > 1
    assert request_ids == {CALLER_REQUEST_ID}


def test_finished_request_is_logged_with_status_and_duration(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO)
    create_booking_ok(client)

    [record] = find_records(caplog, "POST /api/bookings 201")
    assert record.levelno == logging.INFO
    assert vars(record)["status_code"] == 201
    assert isinstance(vars(record)["duration_ms"], int)


def test_health_checks_are_logged_at_debug_only(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    client.get("/api/health")

    [record] = find_records(caplog, "GET /api/health 200")
    assert record.levelno == logging.DEBUG


def test_created_booking_is_logged_without_personal_details_at_info(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO)
    booking = create_booking_ok(client)

    [record] = find_records(caplog, "Booking created")
    assert vars(record)["booking_id"] == booking["id"]
    assert vars(record)["starts_at"] == "2026-10-29T13:00:00-05:00"
    assert "Sam K" not in caplog.text


def test_rejected_booking_is_a_warning_with_its_error_code(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    create_booking_ok(client)
    caplog.set_level(logging.INFO)
    create_booking(client, booker_name="Ana")

    [record] = find_records(caplog, "Request rejected: conflict")
    assert record.levelno == logging.WARNING
    assert vars(record)["status_code"] == 409
