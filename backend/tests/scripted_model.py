"""A fake model for assistant tests: it replies with turns written in advance.

Tests script what the model "decides", then check what the app does with it:
which tools run, what goes back to the model, and what the person sees.
"""

from typing import Any

from app.assistant.llm import (
    CompletionRequest,
    LLMUnavailableError,
    ModelTurn,
    StopReason,
    ToolCall,
    ToolOutcome,
    ToolResultsTurn,
)


class ScriptedModel:
    """Returns the scripted turns in order and keeps every request it got."""

    def __init__(self) -> None:
        self.script: list[ModelTurn | Exception] = []
        self.requests: list[CompletionRequest] = []

    def will_reply(self, *turns: ModelTurn | Exception) -> None:
        self.script.extend(turns)

    def complete(self, request: CompletionRequest) -> ModelTurn:
        self.requests.append(request)
        if not self.script:
            raise AssertionError("The model was called more often than scripted.")
        turn = self.script.pop(0)
        if isinstance(turn, Exception):
            raise turn
        return turn

    def outcomes_sent_back(self) -> list[ToolOutcome]:
        """Every tool result the model was shown, in order."""
        if not self.requests:
            return []
        return [
            outcome
            for turn in self.requests[-1].turns
            if isinstance(turn, ToolResultsTurn)
            for outcome in turn.outcomes
        ]


def call_tools(*calls: tuple[str, dict[str, Any]]) -> ModelTurn:
    """A model turn that calls these tools, in order."""
    tool_calls = [
        ToolCall(call_id=f"call_{index}", name=name, arguments=arguments)
        for index, (name, arguments) in enumerate(calls)
    ]
    return ModelTurn(text="", tool_calls=tool_calls, stop_reason=StopReason.TOOL_CALLS)


def say(text: str, stop_reason: StopReason = StopReason.DONE) -> ModelTurn:
    """A model turn with only text."""
    return ModelTurn(text=text, stop_reason=stop_reason)


def provider_down() -> LLMUnavailableError:
    return LLMUnavailableError("Couldn't reach the provider.")
