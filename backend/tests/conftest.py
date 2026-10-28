"""Shared test setup.

Tests run against a real Postgres database, because the constraint that
prevents double-booking only exists in Postgres. Set TEST_DATABASE_URL to
point at it; the default matches the local Docker Compose database.
"""

import os
from collections.abc import Iterator
from datetime import datetime
from zoneinfo import ZoneInfo

DEFAULT_TEST_DATABASE_URL = (
    "postgresql+psycopg://postgres:postgres@localhost:5432/booking_test"
)
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", DEFAULT_TEST_DATABASE_URL)
os.environ["BOOKING_DATABASE_URL"] = TEST_DATABASE_URL

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.db import get_engine, get_session_factory  # noqa: E402
from app.dependencies import get_clock  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import seed_equipment  # noqa: E402

STUDIO_ZONE = ZoneInfo("America/Chicago")

# "Now" in every test unless a test moves the clock: Tue Oct 27 2026, 10:30 studio time.
DEFAULT_NOW = datetime(2026, 10, 27, 10, 30, tzinfo=STUDIO_ZONE)

ALL_TABLES = "booking_events, booking_items, bookings, equipment"


class FixedClock:
    """A clock tests can set and move."""

    def __init__(self, current: datetime) -> None:
        self.current = current

    def now(self) -> datetime:
        return self.current


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> None:
    """Build the schema once per test run with the real migrations."""
    config = Config("alembic.ini")
    config.attributes["database_url"] = TEST_DATABASE_URL
    command.downgrade(config, "base")
    command.upgrade(config, "head")


@pytest.fixture(autouse=True)
def clean_database(migrated_database: None) -> Iterator[None]:
    """Every test starts with only the seeded equipment."""
    with get_engine().begin() as connection:
        connection.execute(text(f"TRUNCATE {ALL_TABLES} RESTART IDENTITY CASCADE"))
    with get_session_factory()() as session:
        seed_equipment(session)
    yield


@pytest.fixture
def clock() -> Iterator[FixedClock]:
    fixed_clock = FixedClock(DEFAULT_NOW)
    app.dependency_overrides[get_clock] = lambda: fixed_clock
    yield fixed_clock
    app.dependency_overrides.pop(get_clock, None)


@pytest.fixture
def client(clock: FixedClock) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def session() -> Iterator[Session]:
    with get_session_factory()() as db_session:
        yield db_session
