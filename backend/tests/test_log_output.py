"""How log records are formatted, masked, routed and configured."""

import json
import logging
from collections.abc import Iterator
from pathlib import Path

import pytest

from app.config import Settings
from app.observability.formatters import ConsoleFormatter, JsonFormatter
from app.observability.levels import TRACE, parse_level
from app.observability.redaction import MASK, RedactionFilter
from app.observability.request_context import (
    NO_REQUEST_ID,
    bind_request_id,
    get_request_id,
)
from app.observability.setup import (
    OWN_HANDLER_MARKER,
    SQL_LOGGER,
    configure_logging,
    parse_level_overrides,
)
from app.observability.sinks import LOG_FILE_NAME, build_sink_handlers

REQUEST_ID = "3f9a1c2e-8b4d-4c61-9a2f-0d7e5b13c8aa"


def build_record(
    message: str = "Booking created", **fields: object
) -> logging.LogRecord:
    with bind_request_id(REQUEST_ID):
        logger = logging.getLogger("app.services.booking_service")
        return logger.makeRecord(
            logger.name, logging.INFO, __file__, 1, message, (), None, extra=fields
        )


@pytest.fixture
def restore_logging() -> Iterator[None]:
    """Put the test run's logging setup back after a test reconfigures it."""
    yield
    configure_logging(Settings())


def test_json_line_holds_the_request_id_and_extra_fields() -> None:
    record = build_record(booking_id=42, equipment_ids=[1, 5])

    entry = json.loads(JsonFormatter().format(record))

    assert entry["message"] == "Booking created"
    assert entry["level"] == "INFO"
    assert entry["request_id"] == REQUEST_ID
    assert entry["booking_id"] == 42
    assert entry["equipment_ids"] == [1, 5]
    assert entry["time"].endswith("+00:00")


def test_console_line_shows_the_short_request_id_and_fields() -> None:
    record = build_record(booking_id=42)

    line = ConsoleFormatter().format(record)

    assert "[3f9a1c2e]" in line
    assert "Booking created  booking_id=42" in line


def test_request_id_is_none_outside_a_request() -> None:
    assert get_request_id() == NO_REQUEST_ID


def test_redaction_masks_secret_fields_and_url_passwords() -> None:
    url = "postgresql+psycopg://postgres:hunter2@db:5432/booking"
    record = build_record(f"Connecting to {url}", api_key="sk-123", target=url)

    RedactionFilter().filter(record)

    assert (
        record.getMessage()
        == f"Connecting to postgresql+psycopg://postgres:{MASK}@db:5432/booking"
    )
    assert vars(record)["api_key"] == MASK
    assert "hunter2" not in vars(record)["target"]


def test_trace_level_sits_below_debug() -> None:
    assert parse_level("trace") == TRACE
    assert TRACE < logging.DEBUG


def test_unknown_level_is_rejected() -> None:
    with pytest.raises(ValueError, match="Unknown log level"):
        parse_level("loud")


def test_level_overrides_are_parsed_per_logger() -> None:
    overrides = parse_level_overrides("app.services=TRACE, sqlalchemy.engine=info")
    assert overrides == {"app.services": TRACE, "sqlalchemy.engine": logging.INFO}


def test_unknown_sink_is_rejected() -> None:
    with pytest.raises(ValueError, match="Unknown log sinks"):
        build_sink_handlers(Settings(log_sinks="console,carrier-pigeon"))


def test_file_sink_writes_json_lines(tmp_path: Path) -> None:
    settings = Settings(log_sinks="file", log_dir=str(tmp_path))
    [handler] = build_sink_handlers(settings).handlers

    handler.handle(build_record(booking_id=42))
    handler.close()

    log_lines = (tmp_path / LOG_FILE_NAME).read_text().splitlines()
    assert json.loads(log_lines[0])["booking_id"] == 42


def test_configuring_twice_replaces_our_handlers_only(
    restore_logging: None,
) -> None:
    root_logger = logging.getLogger()
    other_handler = logging.NullHandler()
    root_logger.addHandler(other_handler)

    configure_logging(Settings(log_sinks="console"))
    configure_logging(Settings(log_sinks="console"))

    own_handlers = [
        h for h in root_logger.handlers if getattr(h, OWN_HANDLER_MARKER, False)
    ]
    assert len(own_handlers) == 1
    assert other_handler in root_logger.handlers
    root_logger.removeHandler(other_handler)


@pytest.mark.parametrize(
    ("log_level", "expected_sql_level"),
    [("TRACE", logging.INFO), ("DEBUG", logging.WARNING)],
)
def test_sql_statements_show_only_when_tracing(
    restore_logging: None, log_level: str, expected_sql_level: int
) -> None:
    configure_logging(Settings(log_sinks="", log_level=log_level))
    assert logging.getLogger(SQL_LOGGER).level == expected_sql_level


def test_sink_that_cannot_open_is_skipped_and_reported(tmp_path: Path) -> None:
    blocking_file = tmp_path / "not-a-folder"
    blocking_file.write_text("")
    settings = Settings(log_sinks="console,file", log_dir=str(blocking_file))

    setup = build_sink_handlers(settings)

    assert len(setup.handlers) == 1
    assert "file" in setup.failures
