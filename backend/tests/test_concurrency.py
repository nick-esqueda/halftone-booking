"""Races: many people booking the same slot, or editing the same booking, at once."""

import threading
from collections import Counter
from collections.abc import Callable

from fastapi.testclient import TestClient
from httpx2 import Response
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from tests.helpers import CAMERA_A, build_booking, create_booking_ok, update_booking

PARALLEL_REQUESTS = 8


def run_at_once(send_request: Callable[[], Response]) -> list[int]:
    """Fire the request from several threads released together; return status codes."""
    start_together = threading.Barrier(PARALLEL_REQUESTS)
    status_codes: list[int] = []
    lock = threading.Lock()

    def send_when_released() -> None:
        start_together.wait()
        status_code = send_request().status_code
        with lock:
            status_codes.append(status_code)

    threads = [
        threading.Thread(target=send_when_released) for _ in range(PARALLEL_REQUESTS)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    return status_codes


def test_only_one_of_many_simultaneous_bookings_wins(client: TestClient) -> None:
    payload = build_booking(equipment_ids=[CAMERA_A])

    status_codes = run_at_once(lambda: client.post("/api/bookings", json=payload))

    assert Counter(status_codes) == {201: 1, 409: PARALLEL_REQUESTS - 1}


def test_only_one_of_many_simultaneous_edits_wins(client: TestClient) -> None:
    booking = create_booking_ok(client)

    status_codes = run_at_once(lambda: update_booking(client, booking, purpose="Edit"))

    assert Counter(status_codes) == {200: 1, 409: PARALLEL_REQUESTS - 1}


def test_database_rejects_overlap_even_without_the_api(
    client: TestClient, session: Session
) -> None:
    """The constraint is the real guarantee: raw inserts can't double-book either."""
    booking = create_booking_ok(client)
    insert_overlapping_item = text(
        "INSERT INTO booking_items (booking_id, equipment_id, period) "
        "VALUES (:booking_id, :equipment_id, tstzrange(:start, :end, '[)'))"
    )
    parameters = {
        "booking_id": booking["id"],
        "equipment_id": CAMERA_A,
        "start": "2026-10-29T14:00:00-05:00",
        "end": "2026-10-29T16:00:00-05:00",
    }

    try:
        session.execute(insert_overlapping_item, parameters)
        session.commit()
        raised = False
    except IntegrityError as error:
        raised = "booking_items_no_overlap" in str(error.orig)
    assert raised
