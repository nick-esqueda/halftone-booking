"""Application settings, read from environment variables.

Every tunable value for the API lives here so it can be changed without
touching the code. Environment variables use the `BOOKING_` prefix, for
example `BOOKING_DATABASE_URL`.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_DATABASE_URL = "postgresql+psycopg://postgres:postgres@localhost:5432/booking"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BOOKING_", env_file=".env")

    database_url: str = DEFAULT_DATABASE_URL

    # All times are shown and interpreted in the studio's time zone.
    studio_timezone: str = "America/Chicago"

    # Booking start and end times must land on this step, in minutes.
    time_step_minutes: int = 15

    # A new booking may start this many minutes in the past, so "book it now" works.
    start_grace_minutes: int = 5

    # Longest name and purpose we accept, in characters.
    max_booker_name_length: int = 80
    max_purpose_length: int = 200

    # Browser origins allowed to call the API during local development.
    cors_allowed_origins: list[str] = ["http://localhost:5173"]


@lru_cache
def get_settings() -> Settings:
    """Return the settings, loading them from the environment once."""
    return Settings()
