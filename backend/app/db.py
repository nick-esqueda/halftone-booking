"""Database engine and session handling."""

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.observability.sql_timing import SlowQueryLogger


@lru_cache
def get_engine() -> Engine:
    """Return the shared database engine, creating it on first use."""
    settings = get_settings()
    engine = create_engine(settings.database_url, pool_pre_ping=True)
    SlowQueryLogger(settings.slow_query_ms).register(engine)
    return engine


@lru_cache
def get_session_factory() -> sessionmaker[Session]:
    """Return the factory that opens new database sessions."""
    return sessionmaker(bind=get_engine(), expire_on_commit=False)


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one session per request, closed afterwards."""
    session_factory = get_session_factory()
    with session_factory() as session:
        yield session
