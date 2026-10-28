"""Where log lines go: a registry of named sinks.

Pattern: Strategy + registry. Each sink is a factory function that takes
the settings and returns a configured `logging.Handler`. The
`BOOKING_LOG_SINKS` setting picks sinks by name, so log calls never change
when destinations do.

To add a destination (CloudWatch, OpenTelemetry, ...): write a factory that
returns a handler for it, add it to `SINK_FACTORIES` under a new name, and
set `BOOKING_LOG_SINKS=stdout-json,<new name>`.
"""

import logging
import sys
from collections.abc import Callable
from dataclasses import dataclass, field
from logging.handlers import RotatingFileHandler
from pathlib import Path

from app.config import Settings
from app.observability.formatters import ConsoleFormatter, JsonFormatter
from app.observability.redaction import RedactionFilter

SinkFactory = Callable[[Settings], logging.Handler]

LOG_FILE_NAME = "api.log"
BYTES_PER_MB = 1024 * 1024
SINK_NAME_SEPARATOR = ","


def build_console_handler(settings: Settings) -> logging.Handler:
    """Readable lines on stderr, for people watching a terminal."""
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(ConsoleFormatter())
    return handler


def build_stdout_json_handler(settings: Settings) -> logging.Handler:
    """JSON lines on stdout, for a deployed container's log collector."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    return handler


def build_file_handler(settings: Settings) -> logging.Handler:
    """JSON lines in `<log_dir>/api.log`, rotated by size.

    Rotation is only safe with one process writing, which is how local
    development runs. Deployed apps should use `stdout-json` instead.
    """
    log_dir = Path(settings.log_dir)
    log_dir.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(
        log_dir / LOG_FILE_NAME,
        maxBytes=settings.log_file_max_mb * BYTES_PER_MB,
        backupCount=settings.log_file_backups,
        encoding="utf-8",
    )
    handler.setFormatter(JsonFormatter())
    return handler


SINK_FACTORIES: dict[str, SinkFactory] = {
    "console": build_console_handler,
    "file": build_file_handler,
    "stdout-json": build_stdout_json_handler,
}


def parse_sink_names(sinks_setting: str) -> list[str]:
    """Split "console, file" into ["console", "file"]; blank means no sinks."""
    names = [name.strip() for name in sinks_setting.split(SINK_NAME_SEPARATOR)]
    return [name for name in names if name]


@dataclass
class SinkSetup:
    """The handlers that started, and why any others couldn't."""

    handlers: list[logging.Handler] = field(default_factory=list)
    failures: dict[str, str] = field(default_factory=dict)


def build_sink_handlers(settings: Settings) -> SinkSetup:
    """Build each named sink. A sink that can't open (say, a log folder the
    process can't write to) is skipped and reported, so a logging problem
    never stops the API from starting."""
    sink_names = parse_sink_names(settings.log_sinks)
    unknown_names = [name for name in sink_names if name not in SINK_FACTORIES]
    if unknown_names:
        known_names = ", ".join(SINK_FACTORIES)
        raise ValueError(f"Unknown log sinks {unknown_names}; use: {known_names}")

    setup = SinkSetup()
    for name in sink_names:
        try:
            handler = SINK_FACTORIES[name](settings)
        except OSError as error:
            setup.failures[name] = f"{type(error).__name__}: {error}"
            continue
        handler.addFilter(RedactionFilter())
        setup.handlers.append(handler)
    return setup
