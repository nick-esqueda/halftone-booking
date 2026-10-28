"""Runs one assistant request: a short loop of model calls and tool calls.

Each round, the model either calls tools (whose results go back to it) or
finishes. A final tool (`propose_booking`, `ask_user`) ends the loop with a
reply. Limits on rounds and time keep a confused model from running on.
"""

import logging
import time
from collections.abc import Callable
from dataclasses import replace

from app.assistant.llm import (
    CompletionRequest,
    LLMProvider,
    ModelTurn,
    StopReason,
    ToolCall,
    ToolOutcome,
    ToolResultsTurn,
    Turn,
    UserTurn,
)
from app.assistant.prompt import build_context_message, build_system_prompt
from app.assistant.tools import (
    TOOL_SPECS,
    TOOLS_BY_NAME,
    FinalAnswer,
    ToolContext,
    ToolFailure,
    ToolOutput,
    ToolResult,
)
from app.config import Settings
from app.errors import BookingError
from app.schemas import AssistantReply, AssistantRequest

logger = logging.getLogger(__name__)

GAVE_UP_MESSAGE = (
    "I couldn't work that one out. Try naming the item, day and time, "
    "or use + New booking."
)
REFUSED_MESSAGE = "I can't help with that. I can only help book studio equipment."
EMPTY_REPLY_MESSAGE = (
    "I can help you book studio equipment. What do you need, and when?"
)

# Mistakes in a tool call that the model can fix by trying again.
RECOVERABLE_TOOL_ERRORS: tuple[type[Exception], ...] = (
    BookingError,
    ValueError,
    KeyError,
)


def build_message_reply(text: str) -> AssistantReply:
    return AssistantReply(kind="message", message=text)


class AssistantService:
    def __init__(
        self,
        provider: LLMProvider,
        context: ToolContext,
        settings: Settings,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self.provider = provider
        self.context = context
        self.settings = settings
        self.monotonic = monotonic
        self.system_prompt = build_system_prompt(settings)

    def reply(self, request: AssistantRequest) -> AssistantReply:
        context = replace(self.context, booker_name=request.booker_name.strip())
        turns = self._start_conversation(request, context)
        deadline = self.monotonic() + self.settings.assistant_timeout_seconds

        for _ in range(self.settings.assistant_max_model_calls):
            remaining_seconds = deadline - self.monotonic()
            if remaining_seconds <= 0:
                break
            model_turn = self.provider.complete(
                CompletionRequest(
                    system_prompt=self.system_prompt,
                    turns=list(turns),  # A copy: later rounds append to `turns`.
                    tools=TOOL_SPECS,
                    timeout_seconds=remaining_seconds,
                )
            )
            turns.append(model_turn)

            if not model_turn.tool_calls:
                return self._reply_without_tools(model_turn)
            final_answer, outcomes = self._run_tool_calls(
                model_turn.tool_calls, context
            )
            if final_answer is not None:
                return final_answer.reply
            turns.append(ToolResultsTurn(outcomes))

        logger.warning("Assistant gave up on %r", request.message)
        return build_message_reply(GAVE_UP_MESSAGE)

    def _start_conversation(
        self, request: AssistantRequest, context: ToolContext
    ) -> list[Turn]:
        context_text = build_context_message(
            context.now, self.settings, context.booker_name
        )
        earlier_turns: list[Turn] = [
            UserTurn(entry.text) if entry.role == "user" else ModelTurn(entry.text)
            for entry in request.history
        ]
        return [UserTurn(context_text), *earlier_turns, UserTurn(request.message)]

    def _reply_without_tools(self, model_turn: ModelTurn) -> AssistantReply:
        """The model stopped without a final tool: show its text, or explain."""
        replies_by_stop_reason = {
            StopReason.REFUSED: REFUSED_MESSAGE,
            StopReason.TRUNCATED: GAVE_UP_MESSAGE,
        }
        fallback_text = model_turn.text or EMPTY_REPLY_MESSAGE
        text = replies_by_stop_reason.get(model_turn.stop_reason, fallback_text)
        return build_message_reply(text)

    def _run_tool_calls(
        self, tool_calls: list[ToolCall], context: ToolContext
    ) -> tuple[FinalAnswer | None, list[ToolOutcome]]:
        """Run each call in order; a final answer stops the rest."""
        outcomes: list[ToolOutcome] = []
        for call in tool_calls:
            result = run_tool_call(call, context)
            if isinstance(result, FinalAnswer):
                return result, outcomes
            outcomes.append(build_outcome(call, result))
        return None, outcomes


def run_tool_call(call: ToolCall, context: ToolContext) -> ToolResult:
    tool = TOOLS_BY_NAME.get(call.name)
    if tool is None:
        return ToolFailure(f"There's no tool called {call.name}.")
    try:
        return tool.run(call.arguments, context)
    except RECOVERABLE_TOOL_ERRORS as error:
        message = getattr(error, "message", None) or str(error)
        return ToolFailure(message)


def build_outcome(call: ToolCall, result: ToolOutput | ToolFailure) -> ToolOutcome:
    if isinstance(result, ToolFailure):
        return ToolOutcome(call_id=call.call_id, content=result.message, is_error=True)
    return ToolOutcome(call_id=call.call_id, content=result.content)
