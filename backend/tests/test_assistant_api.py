"""The booking assistant, end to end over HTTP, with a scripted model.

The model's choices are scripted, so these tests check the app around it:
tools run against the real database, drafts are checked before they're
offered, nothing is saved, and limits and outages give friendly answers.
How well the real model chooses is measured by the eval set instead.
"""

import json
from typing import Any

from fastapi.testclient import TestClient
from httpx2 import Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.assistant.assistant_service import GAVE_UP_MESSAGE, REFUSED_MESSAGE
from app.assistant.llm import ModelTurn, StopReason, ToolResultsTurn, UserTurn
from app.config import Settings, get_settings
from app.main import app
from tests.helpers import CAMERA_A, CAMERA_B, LIGHTING_KIT_1, create_booking_ok
from tests.scripted_model import ScriptedModel, call_tools, provider_down, say

THURSDAY_1_TO_3 = {"starts_at": "2026-10-29T13:00", "ends_at": "2026-10-29T15:00"}


def ask(client: TestClient, message: str, **fields: Any) -> Response:
    return client.post("/api/assistant/draft", json={"message": message, **fields})


def ask_ok(client: TestClient, message: str, **fields: Any) -> dict[str, Any]:
    response = ask(client, message, **fields)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


def propose(equipment_ids: list[int], **overrides: str) -> ModelTurn:
    arguments = {
        "equipment_ids": equipment_ids,
        **THURSDAY_1_TO_3,
        "purpose": "Interview",
        "message": "Here's a draft for Thursday.",
        **overrides,
    }
    return call_tools(("propose_booking", arguments))


def count_bookings(session: Session) -> int:
    return session.scalar(text("SELECT count(*) FROM bookings")) or 0


def test_config_says_the_assistant_is_off_without_a_model(client: TestClient) -> None:
    assert client.get("/api/config").json()["assistant_enabled"] is False


def test_config_says_the_assistant_is_on_with_a_model(
    client: TestClient, model: ScriptedModel
) -> None:
    assert client.get("/api/config").json()["assistant_enabled"] is True


def test_asking_while_the_assistant_is_off_is_a_503(client: TestClient) -> None:
    response = ask(client, "Camera A Thursday 1pm")
    assert response.status_code == 503
    assert response.json()["code"] == "assistant_unavailable"


def test_a_free_request_becomes_a_draft_that_is_not_saved(
    client: TestClient, model: ScriptedModel, session: Session
) -> None:
    model.will_reply(
        call_tools(("list_equipment", {})),
        call_tools(
            ("check_availability", {**THURSDAY_1_TO_3, "equipment_ids": [CAMERA_A]})
        ),
        propose([CAMERA_A]),
    )

    reply = ask_ok(client, "Camera A Thursday 1 to 3 for an interview")

    assert reply["kind"] == "draft"
    assert reply["message"] == "Here's a draft for Thursday."
    assert reply["draft"] == {
        "equipment_ids": [CAMERA_A],
        "starts_at": "2026-10-29T13:00:00-05:00",
        "ends_at": "2026-10-29T15:00:00-05:00",
        "purpose": "Interview",
    }
    assert count_bookings(session) == 0


def test_tool_results_go_back_to_the_model(
    client: TestClient, model: ScriptedModel
) -> None:
    create_booking_ok(client, booker_name="Ana", purpose="Shoot")
    model.will_reply(
        call_tools(("list_equipment", {})),
        call_tools(
            ("check_availability", {**THURSDAY_1_TO_3, "equipment_ids": [CAMERA_A]})
        ),
        say("Camera A is taken then."),
    )

    ask_ok(client, "Is Camera A free Thursday at 1?")

    equipment_result, availability_result = model.outcomes_sent_back()
    names = [item["name"] for item in json.loads(equipment_result.content)]
    assert "Camera A" in names
    [camera] = json.loads(availability_result.content)
    assert camera["is_free"] is False
    assert camera["busy"] == [
        {
            "starts_at": "2026-10-29T13:00",
            "ends_at": "2026-10-29T15:00",
            "booked_by": "Ana",
            "purpose": "Shoot",
        }
    ]


def test_a_draft_for_a_taken_time_goes_back_to_the_model_as_an_error(
    client: TestClient, model: ScriptedModel
) -> None:
    create_booking_ok(client, booker_name="Ana")
    model.will_reply(propose([CAMERA_A]), say("Camera A is taken at 1 PM."))

    reply = ask_ok(client, "Camera A Thursday 1 to 3")

    assert reply == {
        "kind": "message",
        "message": "Camera A is taken at 1 PM.",
        "draft": None,
        "options": [],
    }
    [outcome] = model.outcomes_sent_back()
    assert outcome.is_error
    assert "Camera A" in outcome.content


def test_a_draft_is_checked_with_the_booking_rules(
    client: TestClient, model: ScriptedModel
) -> None:
    model.will_reply(
        propose([CAMERA_A], starts_at="2026-10-26T13:00", ends_at="2026-10-26T15:00"),
        say("That time has passed."),
    )

    ask_ok(client, "Camera A Monday 1 to 3")

    [outcome] = model.outcomes_sent_back()
    assert outcome.is_error


def test_free_times_skip_bookings_and_the_past(
    client: TestClient, model: ScriptedModel
) -> None:
    create_booking_ok(client, starts_at="2026-10-27T13:00", ends_at="2026-10-27T15:00")
    find_today = {"date": "2026-10-27", "equipment_ids": [CAMERA_A]}
    model.will_reply(
        call_tools(("find_free_times", {**find_today, "min_duration_minutes": 60})),
        say("Which time?"),
    )

    ask_ok(client, "Camera A today")

    [outcome] = model.outcomes_sent_back()
    # Now is 10:30; studio hours run 7 AM to 10 PM.
    assert json.loads(outcome.content) == {
        "date": "2026-10-27",
        "weekday": "Tuesday",
        "free_ranges": [
            {"starts_at": "2026-10-27T10:30", "ends_at": "2026-10-27T13:00"},
            {"starts_at": "2026-10-27T15:00", "ends_at": "2026-10-27T22:00"},
        ],
    }


def test_free_times_for_a_day_that_is_over_are_empty(
    client: TestClient, model: ScriptedModel
) -> None:
    arguments = {"date": "2026-10-26", "equipment_ids": [], "min_duration_minutes": 60}
    model.will_reply(call_tools(("find_free_times", arguments)), say("Which day?"))

    ask_ok(client, "Anything Monday?")

    [outcome] = model.outcomes_sent_back()
    assert json.loads(outcome.content)["free_ranges"] == []


def test_a_vague_time_becomes_a_question_with_options(
    client: TestClient, model: ScriptedModel
) -> None:
    morning = {"starts_at": "2026-10-30T09:00", "ends_at": "2026-10-30T12:00"}
    evening = {"starts_at": "2026-10-30T17:00", "ends_at": "2026-10-30T22:00"}
    model.will_reply(
        call_tools(
            (
                "ask_user",
                {
                    "question": "Which time on Friday?",
                    "purpose": "Friday's shoot",
                    "options": [
                        {"equipment_ids": [CAMERA_B], **morning},
                        {"equipment_ids": [CAMERA_B], **evening},
                    ],
                },
            )
        )
    )

    reply = ask_ok(client, "Camera B for Friday's shoot")

    assert reply["kind"] == "question"
    assert reply["message"] == "Which time on Friday?"
    assert reply["draft"] is None
    assert [option["label"] for option in reply["options"]] == [
        "Fri Oct 30, 9:00 AM – 12:00 PM",
        "Fri Oct 30, 5:00 PM – 10:00 PM",
    ]
    assert reply["options"][0] == {
        "label": "Fri Oct 30, 9:00 AM – 12:00 PM",
        "equipment_ids": [CAMERA_B],
        "starts_at": "2026-10-30T09:00:00-05:00",
        "ends_at": "2026-10-30T12:00:00-05:00",
        "purpose": "Friday's shoot",
    }


def test_an_option_that_is_taken_goes_back_to_the_model(
    client: TestClient, model: ScriptedModel
) -> None:
    create_booking_ok(client)
    model.will_reply(
        call_tools(
            (
                "ask_user",
                {
                    "question": "Which time?",
                    "purpose": "",
                    "options": [{"equipment_ids": [CAMERA_A], **THURSDAY_1_TO_3}],
                },
            )
        ),
        say("Sorry, that's taken."),
    )

    ask_ok(client, "Camera A Thursday")

    [outcome] = model.outcomes_sent_back()
    assert outcome.is_error
    assert outcome.content.startswith("An option can't be booked")


def test_a_question_without_options(client: TestClient, model: ScriptedModel) -> None:
    question = {"question": "Which day?", "purpose": "", "options": []}
    model.will_reply(call_tools(("ask_user", question)))

    reply = ask_ok(client, "I need a light")

    assert reply == {
        "kind": "question",
        "message": "Which day?",
        "draft": None,
        "options": [],
    }


def test_a_final_tool_stops_the_rest_of_the_calls(
    client: TestClient, model: ScriptedModel
) -> None:
    question = {"question": "Which day?", "purpose": "", "options": []}
    model.will_reply(call_tools(("ask_user", question), ("list_equipment", {})))

    assert ask_ok(client, "A light")["kind"] == "question"
    assert len(model.requests) == 1


def test_mistakes_in_tool_calls_go_back_to_the_model(
    client: TestClient, model: ScriptedModel
) -> None:
    bad_time = {"starts_at": "Thursday", "ends_at": "later", "equipment_ids": []}
    model.will_reply(
        call_tools(("book_it_now", {}), ("check_availability", bad_time)),
        say("Could you give me a time?"),
    )

    reply = ask_ok(client, "Camera A Thursday")

    assert reply["message"] == "Could you give me a time?"
    unknown_tool, bad_arguments = model.outcomes_sent_back()
    assert unknown_tool.is_error
    assert unknown_tool.content == "There's no tool called book_it_now."
    assert bad_arguments.is_error


def test_a_model_that_never_finishes_is_stopped(
    client: TestClient, model: ScriptedModel
) -> None:
    max_calls = get_settings().assistant_max_model_calls
    model.will_reply(*[call_tools(("list_equipment", {}))] * (max_calls + 1))

    reply = ask_ok(client, "Camera A Thursday")

    assert reply["message"] == GAVE_UP_MESSAGE
    assert len(model.requests) == max_calls


def test_a_request_out_of_time_stops_without_calling_the_model(
    client: TestClient, model: ScriptedModel
) -> None:
    out_of_time = Settings(assistant_timeout_seconds=0)
    app.dependency_overrides[get_settings] = lambda: out_of_time
    try:
        reply = ask_ok(client, "Camera A Thursday")
    finally:
        app.dependency_overrides.pop(get_settings, None)

    assert reply["message"] == GAVE_UP_MESSAGE
    assert model.requests == []


def test_a_plain_text_reply_is_shown(client: TestClient, model: ScriptedModel) -> None:
    model.will_reply(say("I can only help book studio equipment."))

    reply = ask_ok(client, "Write me a poem")

    assert reply["kind"] == "message"
    assert reply["message"] == "I can only help book studio equipment."


def test_a_refused_request_gets_the_standard_message(
    client: TestClient, model: ScriptedModel
) -> None:
    model.will_reply(say("", StopReason.REFUSED))

    assert ask_ok(client, "Something odd")["message"] == REFUSED_MESSAGE


def test_a_cut_off_reply_gives_up_politely(
    client: TestClient, model: ScriptedModel
) -> None:
    model.will_reply(say("Let me think about", StopReason.TRUNCATED))

    assert ask_ok(client, "Camera A Thursday")["message"] == GAVE_UP_MESSAGE


def test_the_provider_being_down_is_a_503(
    client: TestClient, model: ScriptedModel
) -> None:
    model.will_reply(provider_down())

    response = ask(client, "Camera A Thursday")

    assert response.status_code == 503
    body = response.json()
    assert body["code"] == "assistant_unavailable"
    assert "+ New booking" in body["message"]


def test_too_many_requests_are_refused(
    client: TestClient, model: ScriptedModel
) -> None:
    limit = get_settings().assistant_requests_per_minute
    model.will_reply(*[say("Hi")] * limit)
    for _ in range(limit):
        ask_ok(client, "Hello")

    response = ask(client, "Hello again")

    assert response.status_code == 429
    assert response.json()["code"] == "rate_limited"


def test_the_model_gets_the_context_history_and_message_in_order(
    client: TestClient, model: ScriptedModel
) -> None:
    model.will_reply(say("Which time?"))
    history = [
        {"role": "user", "text": "Camera A Friday"},
        {"role": "assistant", "text": "Which time on Friday?"},
    ]

    ask_ok(client, "The morning", booker_name="  Sam K ", history=history)

    context, earlier_request, earlier_reply, message = model.requests[0].turns
    assert isinstance(context, UserTurn)
    assert "Tuesday 2026-10-27 10:30" in context.text
    assert "The person's name: Sam K\n" in f"{context.text}\n"
    assert earlier_request == UserTurn("Camera A Friday")
    assert earlier_reply == ModelTurn("Which time on Friday?")
    assert message == UserTurn("The morning")


def test_each_round_adds_the_model_turn_and_its_results(
    client: TestClient, model: ScriptedModel
) -> None:
    first_turn = call_tools(("list_equipment", {}))
    model.will_reply(first_turn, say("Done"))

    ask_ok(client, "What's there?")

    *_, model_turn, results = model.requests[1].turns
    assert model_turn == first_turn
    assert isinstance(results, ToolResultsTurn)
    assert results.outcomes[0].call_id == "call_0"


def test_a_draft_can_book_several_items(
    client: TestClient, model: ScriptedModel
) -> None:
    model.will_reply(propose([CAMERA_A, LIGHTING_KIT_1], purpose="  Podcast "))

    reply = ask_ok(client, "Camera A and a light Thursday 1-3 for the podcast")

    assert reply["draft"]["equipment_ids"] == [CAMERA_A, LIGHTING_KIT_1]
    assert reply["draft"]["purpose"] == "Podcast"


def test_messages_that_are_too_long_are_rejected(
    client: TestClient, model: ScriptedModel
) -> None:
    assert ask(client, "x" * 501).status_code == 422
