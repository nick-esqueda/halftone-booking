"""Builds the language model provider named in the settings.

Pattern: a registry of factories. `LLM_PROVIDER_FACTORIES` maps the
`BOOKING_LLM_PROVIDER` setting to a function that builds the provider.

To add a provider: write an adapter that satisfies `LLMProvider` (see
`llm.py`), add a factory function here, and register it under a new name.
"""

from collections.abc import Callable

from app.assistant.anthropic_provider import AnthropicProvider
from app.assistant.llm import LLMProvider
from app.config import Settings

# A factory returns None when the provider isn't configured (no API key, or
# an empty one, as Docker Compose passes when the variable isn't set).
ProviderFactory = Callable[[Settings], LLMProvider | None]


def build_anthropic_provider(settings: Settings) -> LLMProvider | None:
    api_key = settings.anthropic_api_key
    if api_key is None or not api_key.get_secret_value().strip():
        return None
    return AnthropicProvider(
        api_key=api_key.get_secret_value(),
        model=settings.llm_model,
        effort=settings.llm_effort,
        max_output_tokens=settings.llm_max_output_tokens,
    )


LLM_PROVIDER_FACTORIES: dict[str, ProviderFactory] = {
    "anthropic": build_anthropic_provider,
}


def build_llm_provider(settings: Settings) -> LLMProvider | None:
    """The configured provider, or None when the assistant is switched off."""
    factory = LLM_PROVIDER_FACTORIES.get(settings.llm_provider)
    if factory is None:
        raise ValueError(f"Unknown LLM provider: {settings.llm_provider!r}")
    return factory(settings)
