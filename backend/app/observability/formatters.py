"""Turns log records into text: readable lines for people, JSON for tools.

Both formats show the same information: time (UTC), level, request ID,
logger name, message, and any fields passed with `extra={...}`.
"""

import json
import logging
from datetime import UTC, datetime

from app.observability.record_fields import collect_extra_fields
from app.observability.request_context import NO_REQUEST_ID

# Name of this program in JSON logs, so a shared destination can tell apps apart.
SERVICE_NAME = "api"

# The console shows only the start of each request ID; it is enough to tell
# requests apart, and the full ID is in the JSON logs.
SHORT_REQUEST_ID_LENGTH = 8

LEVEL_COLUMN_WIDTH = 7
LOGGER_COLUMN_WIDTH = 32
CONSOLE_TIME_FORMAT = "%Y-%m-%d %H:%M:%S.%f"
MICROSECOND_DIGITS_DROPPED = 3


def get_record_time(record: logging.LogRecord) -> datetime:
    return datetime.fromtimestamp(record.created, tz=UTC)


def get_record_request_id(record: logging.LogRecord) -> str:
    request_id: str = getattr(record, "request_id", NO_REQUEST_ID)
    return request_id


def format_field_pairs(fields: dict[str, object]) -> str:
    """Render fields as `key=value` pairs, e.g. `booking_id=42 status=201`."""
    pairs = [f"{key}={value}" for key, value in fields.items()]
    return " ".join(pairs)


class ConsoleFormatter(logging.Formatter):
    """One readable line per record, with the request ID in brackets."""

    def format(self, record: logging.LogRecord) -> str:
        full_time = get_record_time(record).strftime(CONSOLE_TIME_FORMAT)
        timestamp = full_time[:-MICROSECOND_DIGITS_DROPPED]
        short_id = get_record_request_id(record)[:SHORT_REQUEST_ID_LENGTH]
        level = record.levelname.ljust(LEVEL_COLUMN_WIDTH)
        logger_name = record.name.ljust(LOGGER_COLUMN_WIDTH)
        line = f"{timestamp} {level} [{short_id}] {logger_name} {record.getMessage()}"

        fields = format_field_pairs(collect_extra_fields(record))
        if fields:
            line = f"{line}  {fields}"
        if record.exc_info:
            line = f"{line}\n{self.formatException(record.exc_info)}"
        return line


class JsonFormatter(logging.Formatter):
    """One JSON object per record, for files and log collection services."""

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, object] = {
            "time": get_record_time(record).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": get_record_request_id(record),
            "service": SERVICE_NAME,
            **collect_extra_fields(record),
        }
        if record.exc_info:
            entry["exception"] = self.formatException(record.exc_info)
        # `default=str` covers values JSON can't hold, such as datetimes.
        return json.dumps(entry, default=str)
