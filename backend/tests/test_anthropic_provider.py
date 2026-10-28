"""The Anthropic adapter's translation between the app's turns and the API's.

No network: these check the request and response shapes only.
"""

import pytest
from anthropic.types.beta import (
    BetaMessage,
    BetaTextBlock,
    BetaToolUseBlock,
    BetaUsage,
)

from app.assistant.anthropic_provider import (
    AnthropicProvider,
    build_message_param,
    build_model_turn,
    build_tool_param,
)
from app.assistant.llm import (
    ModelTurn,
    StopReason,
    ToolCall,
    ToolOutcome,
    ToolResultsTurn,
    UserTurn,
)
from app.assistant.providers import build_llm_provider
from app.assistant.tools import TOOL_SPECS
from app.config import Settings

TOOL_USE = BetaToolUseBlock(
    type="tool_use", id="toolu_1", name="list_equipment", input={}
)


def build_message(stop_reason: str, *content: BetaTextBlock | BetaToolUseBlock):
    return BetaMessage(
        id="msg_1",
        type="message",
        role="assistant",
        model="claude-sonnet-5-5",
        content=list(content),
        stop_reason=stop_reason,
        usage=BetaUsage(input_tokens=1, output_tokens=1),
    )


def test_tool_calls_are_read_from_the_reply() -> None:
    message = build_message(
        "tool_use", BetaTextBlock(type="text", text="Checking."), TOOL_USE
    )

    turn = build_model_turn(message)

    assert turn.text == "Checking."
    assert turn.tool_calls == [
        ToolCall(call_id="toolu_1", name="list_equipment", arguments={})
    ]
    assert turn.stop_reason == StopReason.TOOL_CALLS


def test_stop_reasons_are_translated() -> None:
    assert build_model_turn(build_message("refusal")).stop_reason == StopReason.REFUSED
    truncated = build_model_turn(build_message("max_tokens"))
    assert truncated.stop_reason == StopReason.TRUNCATED
    assert build_model_turn(build_message("end_turn")).stop_reason == StopReason.DONE


def test_the_models_own_blocks_are_sent_back_unchanged() -> None:
    turn = build_model_turn(build_message("tool_use", TOOL_USE))

    assert build_message_param(turn) == {"role": "assistant", "content": [TOOL_USE]}


def test_turns_rebuilt_from_history_are_sent_as_text() -> None:
    assert build_message_param(ModelTurn("Which time?")) == {
        "role": "assistant",
        "content": "Which time?",
    }
    assert build_message_param(UserTurn("Friday")) == {
        "role": "user",
        "content": "Friday",
    }


def test_tool_results_are_sent_as_a_user_turn() -> None:
    turn = ToolResultsTurn([ToolOutcome("toolu_1", "No such item.", is_error=True)])

    assert build_message_param(turn) == {
        "role": "user",
        "content": [
            {
                "type": "tool_result",
                "tool_use_id": "toolu_1",
                "content": "No such item.",
                "is_error": True,
            }
        ],
    }


def test_every_tool_schema_is_strict() -> None:
    """Strict tools need every property required and no extra properties."""
    for spec in TOOL_SPECS:
        tool = build_tool_param(spec)
        assert tool["strict"] is True
        check_strict_schema(spec.input_schema)


def check_strict_schema(schema: dict[str, object]) -> None:
    if schema.get("type") == "object":
        properties = schema["properties"]
        assert isinstance(properties, dict)
        assert schema["required"] == list(properties)
        assert schema["additionalProperties"] is False
        for property_schema in properties.values():
            check_strict_schema(property_schema)
    if schema.get("type") == "array":
        items = schema["items"]
        assert isinstance(items, dict)
        check_strict_schema(items)


def test_no_key_or_a_blank_key_switches_the_assistant_off() -> None:
    assert build_llm_provider(Settings(ANTHROPIC_API_KEY=None)) is None
    assert build_llm_provider(Settings(ANTHROPIC_API_KEY="  ")) is None


def test_a_key_builds_the_anthropic_provider() -> None:
    provider = build_llm_provider(Settings(ANTHROPIC_API_KEY="sk-test"))
    assert isinstance(provider, AnthropicProvider)


def test_an_unknown_provider_is_an_error() -> None:
    settings = Settings(ANTHROPIC_API_KEY="sk-test", llm_provider="nope")
    with pytest.raises(ValueError, match="nope"):
        build_llm_provider(settings)
