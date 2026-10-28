"""What the API returns when something outside the booking rules fails.

A database outage is simulated with a real connection to a port nothing
listens on, so the error is the one psycopg raises in production.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db import get_session
from app.dependencies import get_clock
from app.main import app
from tests.helpers import build_booking

UNREACHABLE_DATABASE_URL = "postgresql+psycopg://postgres:postgres@127.0.0.1:1/none"
CONNECT_TIMEOUT_SECONDS = 1


class BrokenClock:
    def now(self) -> None:
        raise RuntimeError("clock exploded")


def get_unreachable_session() -> Iterator[Session]:
    engine = create_engine(
        UNREACHABLE_DATABASE_URL,
        connect_args={"connect_timeout": CONNECT_TIMEOUT_SECONDS},
    )
    with sessionmaker(bind=engine)() as session:
        yield session


@pytest.fixture
def client_without_database() -> Iterator[TestClient]:
    app.dependency_overrides[get_session] = get_unreachable_session
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_session, None)


@pytest.fixture
def client_with_bug() -> Iterator[TestClient]:
    app.dependency_overrides[get_clock] = BrokenClock
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_clock, None)


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("GET", "/api/equipment", None),
        ("GET", "/api/bookings/1", None),
        ("POST", "/api/bookings", build_booking()),
    ],
)
def test_database_outage_is_a_503_in_the_shared_shape(
    client_without_database: TestClient, method: str, path: str, body: object
) -> None:
    response = client_without_database.request(method, path, json=body)

    assert response.status_code == 503
    assert response.json() == {
        "code": "service_unavailable",
        "message": "Booking is temporarily unavailable. Please try again in a minute.",
        "conflicts": [],
        "request_id": response.headers["X-Request-ID"],
    }


def test_health_check_reports_a_database_outage(
    client_without_database: TestClient,
) -> None:
    response = client_without_database.get("/api/health")
    assert response.status_code == 503


def test_health_check_passes_with_the_database_up(client: TestClient) -> None:
    assert client.get("/api/health").json() == {"status": "ok"}


def test_unexpected_error_is_a_500_without_internals(
    client_with_bug: TestClient,
) -> None:
    response = client_with_bug.post("/api/bookings", json=build_booking())

    assert response.status_code == 500
    body = response.json()
    assert body["code"] == "internal_error"
    assert body["request_id"] == response.headers["X-Request-ID"]
    assert "clock exploded" not in response.text
