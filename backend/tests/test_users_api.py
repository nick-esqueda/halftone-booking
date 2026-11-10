"""Logging in and looking up users (A1-A8)."""

from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.main import app
from app.models import User
from tests.conftest import DEFAULT_NOW, TEST_USERNAMES, FixedClock
from tests.helpers import log_in

USERNAME_LIMIT = 80


def count_users(session: Session) -> int:
    return session.scalar(select(func.count()).select_from(User)) or 0


def test_login_matches_ignoring_case(client: TestClient) -> None:
    response = log_in(client, "susie")

    assert response.status_code == 200
    body = response.json()
    assert body["username"] == "Susie"
    assert isinstance(body["id"], int)


def test_login_records_when(
    client: TestClient, clock: FixedClock, session: Session
) -> None:
    clock.current = DEFAULT_NOW + timedelta(hours=1)

    user_id = log_in(client, "Eric").json()["id"]

    user = session.get(User, user_id)
    assert user is not None
    assert user.last_login_at == clock.current


def test_unknown_username_is_404_and_creates_nobody(
    client: TestClient, session: Session
) -> None:
    users_before = count_users(session)

    response = log_in(client, "Nobody Here")

    assert response.status_code == 404
    assert response.json()["code"] == "user_not_found"
    assert count_users(session) == users_before


def test_blank_or_too_long_usernames_are_422(client: TestClient) -> None:
    too_long = "x" * (USERNAME_LIMIT + 1)
    for username in ["", "   ", too_long]:
        response = log_in(client, username)
        assert response.status_code == 422, username


def test_login_trims_and_collapses_spaces(client: TestClient) -> None:
    response = log_in(client, "  Sam   K ")
    assert response.json()["username"] == "Sam K"


def test_login_returns_only_id_and_username(client: TestClient) -> None:
    body = log_in(client, "Susie").json()
    assert set(body) == {"id", "username"}


def test_get_user_by_id(client: TestClient) -> None:
    user = log_in(client, "Susie").json()

    assert client.get(f"/api/users/{user['id']}").json() == user
    assert client.get("/api/users/99999").status_code == 404


def test_list_users_is_sorted_by_username(client: TestClient) -> None:
    usernames = [user["username"] for user in client.get("/api/users").json()]

    assert "Susie" in usernames
    assert set(TEST_USERNAMES) <= set(usernames)
    assert usernames == sorted(usernames, key=str.lower)


def test_no_endpoint_creates_users(client: TestClient) -> None:
    assert client.post("/api/users", json={"username": "New"}).status_code == 405

    schema = app.openapi()
    user_paths = [path for path in schema["paths"] if "user" in path]
    methods = {method for path in user_paths for method in schema["paths"][path]}
    assert methods == {"get"}
