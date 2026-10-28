"""Application settings, read from environment variables.

Every tunable value for the API lives here so it can be changed without
touching the code. Environment variables use the `BOOKING_` prefix, for
example `BOOKING_DATABASE_URL`.
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_DATABASE_URL = "postgresql+psycopg://postgres:postgres@localhost:5432/booking"

LLMEffort = Literal["low", "medium", "high"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BOOKING_", env_file=".env")

    database_url: str = DEFAULT_DATABASE_URL

    # All times are shown and interpreted in the studio's time zone.
    studio_timezone: str = "America/Chicago"

    # Booking start and end times must land on this step, in minutes.
    time_step_minutes: int = 15

    # A new booking may start this many minutes in the past, so "book it now" works.
    start_grace_minutes: int = 5

    # Longest a single booking may last, in days of studio wall-clock time.
    max_booking_days: int = 7

    # Longest name and purpose we accept, in characters.
    max_booker_name_length: int = 80
    max_purpose_length: int = 200

    # Browser origins allowed to call the API during local development.
    cors_allowed_origins: list[str] = ["http://localhost:5173"]

    # AI booking assistant. The provider and model can be swapped without code
    # changes; see app/assistant/providers.py for the available providers.
    llm_provider: str = "anthropic"
    llm_model: str = "claude-sonnet-5-5"
    # Read from the standard variable, without the BOOKING_ prefix. When it's
    # missing, the assistant is switched off and the UI hides it.
    anthropic_api_key: SecretStr | None = Field(
        default=None, validation_alias="ANTHROPIC_API_KEY"
    )
    # How hard the model thinks: "low", "medium" or "high". Higher is slower.
    llm_effort: LLMEffort = "medium"
    llm_max_output_tokens: int = 4000

    # Limits on one assistant request, so a confused model can't run up cost.
    assistant_max_model_calls: int = 5
    assistant_timeout_seconds: float = 20.0
    assistant_requests_per_minute: int = 10

    # Suggested free times are looked for within these studio hours.
    assistant_day_start_hour: int = 7
    assistant_day_end_hour: int = 22
    # Length of a booking when the request gives only a start ("after lunch").
    assistant_default_booking_hours: int = 2

    # Logging (see app/observability). Levels: TRACE, DEBUG, INFO, WARNING, ERROR.
    log_level: str = "INFO"

    # Per-area level overrides, e.g. "app.services=TRACE,sqlalchemy.engine=INFO".
    log_levels: str = ""

    # Where logs go: comma-separated names from app/observability/sinks.py
    # (console, file, stdout-json). Blank means nowhere.
    log_sinks: str = "console"

    # Folder for the `file` sink, and when to rotate its file.
    log_dir: str = "logs"
    log_file_max_mb: int = 10
    log_file_backups: int = 5

    # Requests and queries slower than this are flagged in the logs.
    slow_request_ms: int = 1000
    slow_query_ms: int = 200


@lru_cache
def get_settings() -> Settings:
    """Return the settings, loading them from the environment once."""
    return Settings()
