"""Logs every call to the language model, whichever provider runs it.

Pattern: Decorator. `LoggingLLMProvider` wraps any `LLMProvider` and has the
same `complete` method, so the assistant can't tell the difference. Providers
stay free of logging code, and a new provider is logged with no changes.

Per call:
- DEBUG when it starts: how many turns and tools are sent.
- INFO when it finishes: provider, model, duration, tokens, stop reason, and
  the names of the tools the model asked for.
- WARNING when the provider rate-limits us; ERROR when it fails otherwise.
- TRACE, only with `BOOKING_LOG_LLM_CONTENT=true`: the turns sent and the
  model's reply. Off by default, because they hold what people typed.

To log another kind of failure at its own level, add it to `FAILURE_LEVELS`.
"""

import logging
import time
import uuid
from collections.abc import Callable
from typing import Any

from app.assistant.llm import (
    CompletionRequest,
    LLMProvider,
    LLMRateLimitedError,
    LLMUnavailableError,
    ModelTurn,
    ToolResultsTurn,
    Turn,
    UserTurn,
)
from app.config import Settings
from app.observability.levels import TRACE

logger = logging.getLogger(__name__)

MILLISECONDS_PER_SECOND = 1000

# Ties together the lines one model call writes, within a request that may
# make several calls.
CALL_ID_LENGTH = 8

# How loudly each provider failure is logged. Anything else is an ERROR.
FAILURE_LEVELS: dict[type[LLMUnavailableError], int] = {
    LLMRateLimitedError: logging.WARNING,
}


def measure_duration_ms(started_at: float) -> int:
    elapsed_seconds = time.perf_counter() - started_at
    return round(elapsed_seconds * MILLISECONDS_PER_SECOND)


def describe_model_turn(turn: ModelTurn) -> dict[str, Any]:
    tool_calls = [
        {"name": call.name, "arguments": call.arguments} for call in turn.tool_calls
    ]
    return {"role": "model", "text": turn.text, "tool_calls": tool_calls}


def describe_user_turn(turn: UserTurn) -> dict[str, Any]:
    return {"role": "user", "text": turn.text}


def describe_tool_results_turn(turn: ToolResultsTurn) -> dict[str, Any]:
    outcomes = [
        {"content": outcome.content, "is_error": outcome.is_error}
        for outcome in turn.outcomes
    ]
    return {"role": "tool_results", "outcomes": outcomes}


TURN_DESCRIBERS: dict[type, Callable[[Any], dict[str, Any]]] = {
    UserTurn: describe_user_turn,
    ModelTurn: describe_model_turn,
    ToolResultsTurn: describe_tool_results_turn,
}


def describe_turns(turns: list[Turn]) -> list[dict[str, Any]]:
    """The turns as plain data, for the TRACE content log."""
    return [TURN_DESCRIBERS[type(turn)](turn) for turn in turns]


def describe_usage(turn: ModelTurn) -> dict[str, int]:
    if turn.usage is None:
        return {}
    return {
        "input_tokens": turn.usage.input_tokens,
        "output_tokens": turn.usage.output_tokens,
        "cached_input_tokens": turn.usage.cached_input_tokens,
    }


class LoggingLLMProvider:
    def __init__(self, inner: LLMProvider, settings: Settings) -> None:
        self.inner = inner
        self.provider_fields = {
            "provider": settings.llm_provider,
            "model": settings.llm_model,
        }
        self.is_content_logged = settings.log_llm_content

    def complete(self, request: CompletionRequest) -> ModelTurn:
        call_id = uuid.uuid4().hex[:CALL_ID_LENGTH]
        fields = {**self.provider_fields, "llm_call_id": call_id}
        self._log_request(request, fields)

        started_at = time.perf_counter()
        try:
            turn = self.inner.complete(request)
        except LLMUnavailableError as error:
            self._log_failure(error, fields, measure_duration_ms(started_at))
            raise

        self._log_reply(turn, fields, measure_duration_ms(started_at))
        return turn

    def _log_request(self, request: CompletionRequest, fields: dict[str, Any]) -> None:
        request_fields = {
            "turn_count": len(request.turns),
            "tool_count": len(request.tools),
            "timeout_seconds": round(request.timeout_seconds, 1),
        }
        logger.debug("LLM call started", extra={**fields, **request_fields})

        if self.is_content_logged:
            turns = describe_turns(request.turns)
            logger.log(TRACE, "LLM request content", extra={**fields, "turns": turns})

    def _log_reply(
        self, turn: ModelTurn, fields: dict[str, Any], duration_ms: int
    ) -> None:
        reply_fields = {
            "duration_ms": duration_ms,
            "stop_reason": str(turn.stop_reason),
            "tool_calls": [call.name for call in turn.tool_calls],
            **describe_usage(turn),
        }
        logger.info("LLM call finished", extra={**fields, **reply_fields})

        if self.is_content_logged:
            reply = describe_model_turn(turn)
            logger.log(TRACE, "LLM reply content", extra={**fields, "reply": reply})

    def _log_failure(
        self, error: LLMUnavailableError, fields: dict[str, Any], duration_ms: int
    ) -> None:
        level = FAILURE_LEVELS.get(type(error), logging.ERROR)
        failure_fields = {"duration_ms": duration_ms, "error": str(error)}
        logger.log(level, "LLM call failed", extra={**fields, **failure_fields})
