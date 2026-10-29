"""The provider-neutral view of a language model that the assistant talks to.

Pattern: Adapter. The assistant's tool loop only uses the types in this file.
Each provider (Anthropic, a scripted fake in tests, ...) has an adapter that
converts these types to and from its own API.

To support a new provider: write a class with a `complete` method matching
`LLMProvider`, and register a factory for it in `providers.py`.
"""

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, Protocol


@dataclass(frozen=True)
class ToolSpec:
    """A tool the model may call, described with a JSON schema."""

    name: str
    description: str
    input_schema: dict[str, Any]


@dataclass(frozen=True)
class ToolCall:
    call_id: str
    name: str
    arguments: dict[str, Any]


@dataclass(frozen=True)
class ToolOutcome:
    """What a tool returned, sent back to the model as the call's result."""

    call_id: str
    content: str
    is_error: bool = False


class StopReason(StrEnum):
    TOOL_CALLS = "tool_calls"  # The model wants its tool calls run.
    DONE = "done"  # The model finished with plain text.
    REFUSED = "refused"  # The provider declined the request.
    TRUNCATED = "truncated"  # The reply hit the output token limit.


@dataclass(frozen=True)
class TokenUsage:
    """Tokens one model call used, for logs and cost tracking."""

    input_tokens: int
    output_tokens: int
    cached_input_tokens: int = 0


@dataclass(frozen=True)
class UserTurn:
    text: str


@dataclass(frozen=True)
class ModelTurn:
    """One reply from the model.

    `provider_content` holds the provider's own reply blocks, so its adapter
    can send them back unchanged on the next call. It's None for turns the
    app rebuilt from saved text. `usage` is None when the provider doesn't
    report token counts.
    """

    text: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    stop_reason: StopReason = StopReason.DONE
    provider_content: Any = None
    usage: TokenUsage | None = None


@dataclass(frozen=True)
class ToolResultsTurn:
    outcomes: list[ToolOutcome]


Turn = UserTurn | ModelTurn | ToolResultsTurn


@dataclass(frozen=True)
class CompletionRequest:
    system_prompt: str
    turns: list[Turn]
    tools: list[ToolSpec]
    timeout_seconds: float


class LLMUnavailableError(Exception):
    """The provider couldn't be reached or rejected the call (outage, bad key)."""


class LLMRateLimitedError(LLMUnavailableError):
    """The provider is up but asked us to slow down."""


class LLMProvider(Protocol):
    def complete(self, request: CompletionRequest) -> ModelTurn: ...
