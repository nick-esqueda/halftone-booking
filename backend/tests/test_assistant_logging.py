"""What the assistant and its model calls write to the logs."""

import logging

import pytest
from anthropic.types.beta import BetaMessage, BetaTextBlock, BetaUsage
from fastapi.testclient import TestClient

from app.assistant.anthropic_provider import build_model_turn
from app.assistant.llm import (
    CompletionRequest,
    LLMRateLimitedError,
    ModelTurn,
    TokenUsage,
    UserTurn,
)
from app.assistant.llm_logging import LoggingLLMProvider
from app.assistant.tools import TOOL_SPECS
from app.config import Settings
from app.observability.levels import TRACE
from tests.helpers import CAMERA_A
from tests.scripted_model import ScriptedModel, call_tools, provider_down, say

PRIVATE_MESSAGE = "Camera A Thursday 1 to 3 for my secret interview"
THURSDAY_1_TO_3 = {"starts_at": "2026-10-29T13:00", "ends_at": "2026-10-29T15:00"}
USAGE = TokenUsage(input_tokens=1842, output_tokens=216, cached_input_tokens=1500)
REQUEST = CompletionRequest(
    system_prompt="You book equipment.",
    turns=[UserTurn(PRIVATE_MESSAGE)],
    tools=TOOL_SPECS,
    timeout_seconds=20.0,
)


def find_record(caplog: pytest.LogCaptureFixture, message: str) -> logging.LogRecord:
    [record] = [r for r in caplog.records if r.getMessage() == message]
    return record


def build_logged_model(
    model: ScriptedModel, is_content_logged: bool = False
) -> LoggingLLMProvider:
    settings = Settings(
        llm_provider="anthropic",
        llm_model="claude-test",
        log_llm_content=is_content_logged,
    )
    return LoggingLLMProvider(model, settings)


def ask_for_draft(client: TestClient, model: ScriptedModel) -> None:
    arguments = {
        "equipment_ids": [CAMERA_A],
        **THURSDAY_1_TO_3,
        "purpose": "Interview",
        "message": "Here's a draft for Thursday.",
    }
    model.will_reply(call_tools(("propose_booking", arguments)))
    response = client.post("/api/assistant/draft", json={"message": PRIVATE_MESSAGE})
    assert response.status_code == 200, response.text


def test_finished_call_logs_model_tokens_and_tool_names(
    caplog: pytest.LogCaptureFixture,
) -> None:
    model = ScriptedModel()
    turn = call_tools(("find_bookings", {}))
    model.will_reply(ModelTurn(text="", tool_calls=turn.tool_calls, usage=USAGE))
    caplog.set_level(logging.INFO)

    build_logged_model(model).complete(REQUEST)

    fields = vars(find_record(caplog, "LLM call finished"))
    assert fields["provider"] == "anthropic"
    assert fields["model"] == "claude-test"
    assert fields["tool_calls"] == ["find_bookings"]
    assert fields["input_tokens"] == 1842
    assert fields["cached_input_tokens"] == 1500
    assert isinstance(fields["duration_ms"], int)


def test_failed_call_is_an_error_and_still_raises(
    caplog: pytest.LogCaptureFixture,
) -> None:
    model = ScriptedModel()
    model.will_reply(provider_down())

    with pytest.raises(Exception, match="Couldn't reach"):
        build_logged_model(model).complete(REQUEST)

    assert find_record(caplog, "LLM call failed").levelno == logging.ERROR


def test_rate_limited_call_is_a_warning(caplog: pytest.LogCaptureFixture) -> None:
    model = ScriptedModel()
    model.will_reply(LLMRateLimitedError("Slow down."))

    with pytest.raises(LLMRateLimitedError):
        build_logged_model(model).complete(REQUEST)

    assert find_record(caplog, "LLM call failed").levelno == logging.WARNING


def test_content_stays_out_of_the_logs_by_default(
    caplog: pytest.LogCaptureFixture,
) -> None:
    model = ScriptedModel()
    model.will_reply(say("Which day?"))
    caplog.set_level(TRACE)

    build_logged_model(model).complete(REQUEST)

    assert PRIVATE_MESSAGE not in caplog.text
    assert "Which day?" not in caplog.text


def test_content_is_logged_at_trace_when_switched_on(
    caplog: pytest.LogCaptureFixture,
) -> None:
    model = ScriptedModel()
    model.will_reply(say("Which day?"))
    caplog.set_level(TRACE)

    build_logged_model(model, is_content_logged=True).complete(REQUEST)

    request_record = find_record(caplog, "LLM request content")
    reply_record = find_record(caplog, "LLM reply content")
    assert request_record.levelno == TRACE
    assert vars(request_record)["turns"] == [{"role": "user", "text": PRIVATE_MESSAGE}]
    assert vars(reply_record)["reply"]["text"] == "Which day?"


def test_assistant_reply_is_logged_without_what_the_person_typed(
    client: TestClient, model: ScriptedModel, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO)
    ask_for_draft(client, model)

    fields = vars(find_record(caplog, "Assistant replied"))
    assert fields["reply_kind"] == "draft"
    assert fields["equipment_ids"] == [CAMERA_A]
    assert find_record(caplog, "LLM call finished").levelno == logging.INFO
    assert "secret interview" not in caplog.text


def test_assistant_tool_calls_are_logged_at_debug(
    client: TestClient, model: ScriptedModel, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    ask_for_draft(client, model)

    fields = vars(find_record(caplog, "Tool call finished"))
    assert fields["tool"] == "propose_booking"
    assert fields["result"] == "final_answer"


def test_anthropic_usage_becomes_token_usage() -> None:
    message = BetaMessage(
        id="msg_1",
        type="message",
        role="assistant",
        model="claude-sonnet-5-5",
        content=[BetaTextBlock(type="text", text="Hi")],
        stop_reason="end_turn",
        usage=BetaUsage(input_tokens=10, output_tokens=3),
    )

    turn = build_model_turn(message)

    assert turn.usage == TokenUsage(input_tokens=10, output_tokens=3)
