"""The users table and the user seed (D5-D7)."""

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_engine
from app.models import User
from app.seed import seed_users
from app.studio_users import STUDIO_USERNAMES
from tests.conftest import ALL_TABLES

STUDIO_USER_COUNT = 14


def count_users(session: Session) -> int:
    return session.scalar(select(func.count()).select_from(User)) or 0


@pytest.fixture
def empty_users_table(session: Session) -> Session:
    """A database with no users at all, not even the ones every test gets."""
    with get_engine().begin() as connection:
        connection.execute(text(f"TRUNCATE {ALL_TABLES} CASCADE"))
    return session


def test_usernames_are_unique_ignoring_case(session: Session) -> None:
    session.add(User(username="SUSIE"))
    with pytest.raises(IntegrityError):
        session.commit()


def test_seed_adds_the_fourteen_studio_users(empty_users_table: Session) -> None:
    added_count = seed_users(empty_users_table)

    usernames = empty_users_table.scalars(select(User.username).order_by(User.id))
    assert added_count == STUDIO_USER_COUNT
    assert list(usernames) == STUDIO_USERNAMES


def test_seeding_twice_adds_nothing_and_keeps_other_users(
    empty_users_table: Session,
) -> None:
    empty_users_table.add(User(username="Visiting Artist"))
    empty_users_table.commit()

    seed_users(empty_users_table)
    added_again = seed_users(empty_users_table)

    assert added_again == 0
    assert count_users(empty_users_table) == STUDIO_USER_COUNT + 1


def test_seed_adds_a_name_listed_twice_once(empty_users_table: Session) -> None:
    added_count = seed_users(empty_users_table, ["Sam K", "sam k", "Ana"])

    usernames = empty_users_table.scalars(select(User.username).order_by(User.id))
    assert added_count == 2
    assert list(usernames) == ["Sam K", "Ana"]
