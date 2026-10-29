"""Adapter that runs the assistant on Claude through the Anthropic SDK."""

from typing import Final

import anthropic
from anthropic.types.beta import (
    BetaMessage,
    BetaMessageParam,
    BetaTextBlockParam,
    BetaToolParam,
    BetaToolResultBlockParam,
    BetaUsage,
)

from app.assistant.llm import (
    CompletionRequest,
    LLMRateLimitedError,
    LLMUnavailableError,
    ModelTurn,
    StopReason,
    TokenUsage,
    ToolCall,
    ToolResultsTurn,
    ToolSpec,
    Turn,
    UserTurn,
)
from app.config import LLMEffort

# If the model declines a request, the API retries it on a model chosen for
# that kind of refusal, inside the same call.
FALLBACK_BETA = "server-side-fallback-2026-07-01"
FALLBACK_MODE: Final = "default"

# The assistant's own loop and timeout handle slow calls; one SDK retry covers
# brief network blips without doubling the wait.
SDK_MAX_RETRIES = 1

STOP_REASONS: dict[str, StopReason] = {
    "tool_use": StopReason.TOOL_CALLS,
    "end_turn": StopReason.DONE,
    "refusal": StopReason.REFUSED,
    "max_tokens": StopReason.TRUNCATED,
}


class AnthropicProvider:
    def __init__(
        self, api_key: str, model: str, effort: LLMEffort, max_output_tokens: int
    ) -> None:
        self.client = anthropic.Anthropic(api_key=api_key, max_retries=SDK_MAX_RETRIES)
        self.model = model
        self.effort = effort
        self.max_output_tokens = max_output_tokens

    def complete(self, request: CompletionRequest) -> ModelTurn:
        try:
            response = self.client.beta.messages.create(
                model=self.model,
                max_tokens=self.max_output_tokens,
                # The system prompt and tools never change between requests,
                # so they're cached; per-request details go in the messages.
                system=[build_system_param(request.system_prompt)],
                tools=[build_tool_param(tool) for tool in request.tools],
                messages=[build_message_param(turn) for turn in request.turns],
                output_config={"effort": self.effort},
                betas=[FALLBACK_BETA],
                fallbacks=FALLBACK_MODE,
                timeout=request.timeout_seconds,
            )
        except anthropic.APIConnectionError as error:
            # Also covers timeouts (APITimeoutError is a subclass).
            raise LLMUnavailableError(f"Couldn't reach Anthropic: {error}") from error
        except anthropic.RateLimitError as error:
            raise LLMRateLimitedError("Anthropic rate limit reached.") from error
        except anthropic.APIStatusError as error:
            # Logged by LoggingLLMProvider, which wraps every provider.
            message = f"Anthropic error {error.status_code}: {error.message}"
            raise LLMUnavailableError(message) from error

        return build_model_turn(response)


def build_system_param(system_prompt: str) -> BetaTextBlockParam:
    return {
        "type": "text",
        "text": system_prompt,
        "cache_control": {"type": "ephemeral"},
    }


def build_tool_param(tool: ToolSpec) -> BetaToolParam:
    # `strict` makes the API guarantee the arguments match the schema.
    return {
        "name": tool.name,
        "description": tool.description,
        "input_schema": tool.input_schema,
        "strict": True,
    }


def build_message_param(turn: Turn) -> BetaMessageParam:
    if isinstance(turn, UserTurn):
        return {"role": "user", "content": turn.text}
    if isinstance(turn, ToolResultsTurn):
        results: list[BetaToolResultBlockParam] = [
            {
                "type": "tool_result",
                "tool_use_id": outcome.call_id,
                "content": outcome.content,
                "is_error": outcome.is_error,
            }
            for outcome in turn.outcomes
        ]
        return {"role": "user", "content": results}

    # Send the model's own blocks back unchanged (thinking blocks included);
    # turns rebuilt from saved text only have their text.
    content = turn.provider_content if turn.provider_content else turn.text
    return {"role": "assistant", "content": content}


def build_model_turn(response: BetaMessage) -> ModelTurn:
    text_parts = [block.text for block in response.content if block.type == "text"]
    tool_calls = [
        ToolCall(call_id=block.id, name=block.name, arguments=dict(block.input))
        for block in response.content
        if block.type == "tool_use"
    ]
    stop_reason = STOP_REASONS.get(response.stop_reason or "", StopReason.DONE)
    return ModelTurn(
        text="\n".join(text_parts).strip(),
        tool_calls=tool_calls,
        stop_reason=stop_reason,
        provider_content=response.content,
        usage=build_token_usage(response.usage),
    )


def build_token_usage(usage: BetaUsage) -> TokenUsage:
    return TokenUsage(
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        cached_input_tokens=usage.cache_read_input_tokens or 0,
    )
