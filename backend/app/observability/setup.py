"""Sets up logging for the whole API from the settings.

`configure_logging` is safe to call more than once: it replaces only the
handlers it added before, so test tools such as pytest's `caplog` keep
working.
"""

import logging

from app.config import Settings
from app.observability.levels import TRACE, parse_level, register_trace_level
from app.observability.request_context import install_request_id_on_records
from app.observability.sinks import build_sink_handlers

# Set on the handlers we add, so a second call knows which ones to replace.
OWN_HANDLER_MARKER = "is_booking_sink"

logger = logging.getLogger(__name__)

# uvicorn's own loggers: we send them through our sinks. Its access log is
# switched off because our middleware writes a richer line per request.
UVICORN_LOGGERS = ("uvicorn", "uvicorn.error")
UVICORN_ACCESS_LOGGER = "uvicorn.access"

# SQLAlchemy logs every SQL statement at INFO. Show them only when tracing.
SQL_LOGGER = "sqlalchemy.engine"
SQL_LEVEL_WHEN_TRACING = logging.INFO
SQL_LEVEL_OTHERWISE = logging.WARNING

OVERRIDE_SEPARATOR = ","
OVERRIDE_ASSIGNMENT = "="


def configure_logging(settings: Settings) -> None:
    register_trace_level()
    install_request_id_on_records()

    root_level = parse_level(settings.log_level)
    root_logger = logging.getLogger()
    root_logger.setLevel(root_level)
    sink_setup = build_sink_handlers(settings)
    replace_own_handlers(root_logger, sink_setup.handlers)

    route_uvicorn_logs()
    set_sql_level(root_level)
    apply_level_overrides(parse_level_overrides(settings.log_levels))
    report_sink_failures(sink_setup.failures)


def replace_own_handlers(
    root_logger: logging.Logger, new_handlers: list[logging.Handler]
) -> None:
    old_handlers = [
        handler
        for handler in root_logger.handlers
        if getattr(handler, OWN_HANDLER_MARKER, False)
    ]
    for handler in old_handlers:
        root_logger.removeHandler(handler)
        handler.close()

    for handler in new_handlers:
        setattr(handler, OWN_HANDLER_MARKER, True)
        root_logger.addHandler(handler)


def route_uvicorn_logs() -> None:
    for logger_name in UVICORN_LOGGERS:
        uvicorn_logger = logging.getLogger(logger_name)
        uvicorn_logger.handlers.clear()
        uvicorn_logger.propagate = True
    logging.getLogger(UVICORN_ACCESS_LOGGER).disabled = True


def set_sql_level(root_level: int) -> None:
    is_tracing = root_level <= TRACE
    sql_level = SQL_LEVEL_WHEN_TRACING if is_tracing else SQL_LEVEL_OTHERWISE
    logging.getLogger(SQL_LOGGER).setLevel(sql_level)


def parse_level_overrides(overrides_setting: str) -> dict[str, int]:
    """Parse "app.services=DEBUG,sqlalchemy.engine=INFO" into levels by logger."""
    entries = [entry.strip() for entry in overrides_setting.split(OVERRIDE_SEPARATOR)]
    levels_by_logger: dict[str, int] = {}
    for entry in filter(None, entries):
        logger_name, separator, level_name = entry.partition(OVERRIDE_ASSIGNMENT)
        if not separator:
            raise ValueError(f"Log level override {entry!r} must look like name=LEVEL")
        levels_by_logger[logger_name.strip()] = parse_level(level_name)
    return levels_by_logger


def report_sink_failures(failures: dict[str, str]) -> None:
    for sink_name, reason in failures.items():
        fields = {"sink": sink_name, "reason": reason}
        logger.warning("Log sink unavailable, continuing without it", extra=fields)


def apply_level_overrides(levels_by_logger: dict[str, int]) -> None:
    for logger_name, level in levels_by_logger.items():
        logging.getLogger(logger_name).setLevel(level)
