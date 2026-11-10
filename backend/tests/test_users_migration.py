"""Migration 0002: the users table and the backfill from existing bookings (D1-D4)."""

from collections.abc import Iterator

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Connection, inspect, text

from app.db import get_engine
from tests.conftest import TEST_DATABASE_URL

BEFORE_USERS_REVISION = "0001"

INSERT_BOOKING_SQL = text(
    "INSERT INTO bookings (booker_name, purpose, version, created_at, updated_at) "
    "VALUES (:name, '', 1, :created_at, :created_at) RETURNING id"
)
INSERT_EVENT_SQL = text(
    "INSERT INTO booking_events (booking_id, action, actor_name, summary) "
    "VALUES (:booking_id, 'created', :name, '')"
)

# Booker names as stored before users existed, oldest first.
OLD_BOOKINGS = [
    ("Sam K", "2026-10-01T09:00:00Z"),
    ("sam k", "2026-10-02T09:00:00Z"),
    ("Ana", "2026-10-03T09:00:00Z"),
]


def build_alembic_config() -> Config:
    config = Config("alembic.ini")
    config.attributes["database_url"] = TEST_DATABASE_URL
    return config


@pytest.fixture
def database_before_users() -> Iterator[Config]:
    """Roll back to before users existed; restore the latest schema afterwards."""
    config = build_alembic_config()
    command.downgrade(config, BEFORE_USERS_REVISION)
    yield config
    command.upgrade(config, "head")


def insert_old_bookings(connection: Connection) -> None:
    for name, created_at in OLD_BOOKINGS:
        values = {"name": name, "created_at": created_at}
        booking_id = connection.execute(INSERT_BOOKING_SQL, values).scalar_one()
        connection.execute(INSERT_EVENT_SQL, {"booking_id": booking_id, "name": name})


def list_column_names(table_name: str) -> set[str]:
    columns = inspect(get_engine()).get_columns(table_name)
    return {column["name"] for column in columns}


def test_users_table_has_no_password_column() -> None:
    assert list_column_names("users") == {
        "id",
        "username",
        "created_at",
        "last_login_at",
    }


def test_upgrade_makes_one_user_per_name_ignoring_case(
    database_before_users: Config,
) -> None:
    with get_engine().begin() as connection:
        insert_old_bookings(connection)

    command.upgrade(database_before_users, "head")

    with get_engine().connect() as connection:
        usernames = connection.execute(
            text("SELECT username FROM users ORDER BY username")
        ).scalars()
        booking_links = connection.execute(
            text(
                "SELECT users.username FROM bookings "
                "JOIN users ON users.id = bookings.user_id ORDER BY bookings.id"
            )
        ).scalars()
        event_links = connection.execute(
            text(
                "SELECT users.username FROM booking_events "
                "JOIN users ON users.id = booking_events.actor_user_id "
                "ORDER BY booking_events.id"
            )
        ).scalars()
        assert list(usernames) == ["Ana", "Sam K"]
        assert list(booking_links) == ["Sam K", "Sam K", "Ana"]
        assert list(event_links) == ["Sam K", "Sam K", "Ana"]


def test_upgrade_replaces_name_columns_with_required_links(
    database_before_users: Config,
) -> None:
    command.upgrade(database_before_users, "head")

    booking_columns = inspect(get_engine()).get_columns("bookings")
    event_columns = inspect(get_engine()).get_columns("booking_events")
    nullable_by_booking_column = {c["name"]: c["nullable"] for c in booking_columns}
    nullable_by_event_column = {c["name"]: c["nullable"] for c in event_columns}
    assert "booker_name" not in nullable_by_booking_column
    assert "actor_name" not in nullable_by_event_column
    assert nullable_by_booking_column["user_id"] is False
    assert nullable_by_event_column["actor_user_id"] is False


def test_downgrade_restores_the_names(database_before_users: Config) -> None:
    with get_engine().begin() as connection:
        insert_old_bookings(connection)
    command.upgrade(database_before_users, "head")

    command.downgrade(database_before_users, BEFORE_USERS_REVISION)

    with get_engine().connect() as connection:
        booker_names = connection.execute(
            text("SELECT booker_name FROM bookings ORDER BY id")
        ).scalars()
        actor_names = connection.execute(
            text("SELECT actor_name FROM booking_events ORDER BY id")
        ).scalars()
        assert list(booker_names) == ["Sam K", "Sam K", "Ana"]
        assert list(actor_names) == ["Sam K", "Sam K", "Ana"]
    assert "users" not in inspect(get_engine()).get_table_names()
