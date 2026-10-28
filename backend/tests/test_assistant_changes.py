"""The assistant finding, changing and cancelling existing bookings.

Like new bookings, changes and cancellations are only suggested: the person
confirms them in the UI, so these tests also check nothing is saved.
"""

import json
from datetime import timedelta
from typing import Any

from fastapi.testclient import TestClient

from app.assistant.llm import ModelTurn
from tests.conftest import FixedClock
from tests.helpers import CAMERA_A, CAMERA_B, cancel_booking, create_booking_ok
from tests.scripted_model import ScriptedModel, call_tools, say

THURSDAY_1_TO_3 = {"starts_at": "2026-10-29T13:00", "ends_at": "2026-10-29T15:00"}


def ask_ok(client: TestClient, message: str, **fields: Any) -> dict[str, Any]:
    response = client.post("/api/assistant/draft", json={"message": message, **fields})
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


def propose_change(booking_id: int, **overrides: Any) -> ModelTurn:
    arguments = {
        "booking_id": booking_id,
        "equipment_ids": [CAMERA_A],
        **THURSDAY_1_TO_3,
        "purpose": "Interview",
        "message": "Here's the change.",
        **overrides,
    }
    return call_tools(("propose_change", arguments))


def propose_cancel(booking_id: int) -> ModelTurn:
    arguments = {"booking_id": booking_id, "message": "Cancel this one?"}
    return call_tools(("propose_cancel", arguments))


def get_booking(client: TestClient, booking_id: int) -> dict[str, Any]:
    body: dict[str, Any] = client.get(f"/api/bookings/{booking_id}").json()
    return body


def test_find_bookings_lists_the_persons_upcoming_bookings(
    client: TestClient, model: ScriptedModel, clock: FixedClock
) -> None:
    clock.current -= timedelta(days=1)
    create_booking_ok(client, starts_at="2026-10-26T13:00", ends_at="2026-10-26T15:00")
    clock.current += timedelta(days=1)
    upcoming = create_booking_ok(client, purpose="Interview")
    cancelled = create_booking_ok(client, equipment_ids=[CAMERA_B])
    cancel_booking(client, cancelled)
    create_booking_ok(client, booker_name="Ana", equipment_ids=[CAMERA_B])
    model.will_reply(call_tools(("find_bookings", {"booker_name": ""})), say("Ok"))

    ask_ok(client, "What have I booked?", booker_name="sam k")

    [outcome] = model.outcomes_sent_back()
    assert json.loads(outcome.content) == {
        "booker_name": "sam k",
        "bookings": [
            {
                "booking_id": upcoming["id"],
                "booked_by": "Sam K",
                "purpose": "Interview",
                "items": [{"id": CAMERA_A, "name": "Camera A"}],
                **THURSDAY_1_TO_3,
            }
        ],
    }


def test_find_bookings_needs_a_name(client: TestClient, model: ScriptedModel) -> None:
    model.will_reply(
        call_tools(("find_bookings", {"booker_name": ""})), say("What's your name?")
    )

    ask_ok(client, "Cancel my booking")

    [outcome] = model.outcomes_sent_back()
    assert outcome.is_error
    assert "name isn't known" in outcome.content


def test_a_change_is_suggested_with_the_original_and_not_saved(
    client: TestClient, model: ScriptedModel
) -> None:
    booking = create_booking_ok(client, purpose="Interview")
    model.will_reply(propose_change(booking["id"], ends_at="2026-10-29T18:00"))

    reply = ask_ok(client, "Make my Camera A booking end at 6")

    assert reply["kind"] == "change"
    assert reply["booking_id"] == booking["id"]
    assert reply["draft"]["ends_at"] == "2026-10-29T18:00:00-05:00"
    assert reply["original"] == {
        "equipment_ids": [CAMERA_A],
        "starts_at": "2026-10-29T13:00:00-05:00",
        "ends_at": "2026-10-29T15:00:00-05:00",
        "purpose": "Interview",
    }
    saved = get_booking(client, booking["id"])
    assert saved["ends_at"] == booking["ends_at"]
    assert saved["version"] == booking["version"]


def test_a_change_may_overlap_the_bookings_own_old_time(
    client: TestClient, model: ScriptedModel
) -> None:
    booking = create_booking_ok(client)
    later = {"starts_at": "2026-10-29T14:00", "ends_at": "2026-10-29T16:00"}
    model.will_reply(propose_change(booking["id"], **later))

    assert ask_ok(client, "Move it an hour later")["kind"] == "change"


def test_a_change_onto_someone_elses_booking_goes_back_to_the_model(
    client: TestClient, model: ScriptedModel
) -> None:
    booking = create_booking_ok(client)
    create_booking_ok(
        client,
        booker_name="Ana",
        starts_at="2026-10-29T15:00",
        ends_at="2026-10-29T17:00",
    )
    model.will_reply(
        propose_change(booking["id"], ends_at="2026-10-29T18:00"),
        say("Ana has Camera A from 3 PM."),
    )

    reply = ask_ok(client, "Make it end at 6")

    assert reply["kind"] == "message"
    [outcome] = model.outcomes_sent_back()
    assert outcome.is_error
    assert "Camera A" in outcome.content


def test_a_change_to_a_missing_or_cancelled_booking_is_refused(
    client: TestClient, model: ScriptedModel
) -> None:
    booking = create_booking_ok(client)
    cancel_booking(client, booking)
    model.will_reply(
        propose_change(booking["id"]), propose_change(999), say("Can't do that.")
    )

    ask_ok(client, "Change it")

    cancelled_outcome, missing_outcome = model.outcomes_sent_back()
    assert cancelled_outcome.content == "This booking is already cancelled."
    assert missing_outcome.content == "Booking 999 doesn't exist."


def test_a_cancellation_is_suggested_and_not_done(
    client: TestClient, model: ScriptedModel
) -> None:
    booking = create_booking_ok(client, purpose="Interview")
    model.will_reply(propose_cancel(booking["id"]))

    reply = ask_ok(client, "Cancel my Thursday booking")

    assert reply["kind"] == "cancel"
    assert reply["message"] == "Cancel this one?"
    assert reply["booking_id"] == booking["id"]
    assert reply["original"]["purpose"] == "Interview"
    assert reply["draft"] is None
    assert get_booking(client, booking["id"])["is_cancelled"] is False


def test_a_finished_booking_cant_be_cancelled(
    client: TestClient, model: ScriptedModel, clock: FixedClock
) -> None:
    booking = create_booking_ok(client)
    clock.current += timedelta(days=3)
    model.will_reply(propose_cancel(booking["id"]), say("That one's over."))

    ask_ok(client, "Cancel it")

    [outcome] = model.outcomes_sent_back()
    assert outcome.content == "Finished bookings can't be cancelled."
