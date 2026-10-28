"""Alembic entry point: runs migrations against the configured database."""

from alembic import context
from sqlalchemy import create_engine

from app.config import get_settings
from app.models import Base

target_metadata = Base.metadata


def run_migrations() -> None:
    database_url = (
        context.config.attributes.get("database_url") or get_settings().database_url
    )
    engine = create_engine(database_url)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


run_migrations()
