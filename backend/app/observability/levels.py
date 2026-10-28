"""Adds a TRACE level below DEBUG, for step-by-step detail.

Python's logging has no TRACE level, so we register one. Log at it with
`logger.log(TRACE, "message", extra={...})`.
"""

import logging

TRACE = 5
TRACE_NAME = "TRACE"


def register_trace_level() -> None:
    logging.addLevelName(TRACE, TRACE_NAME)


def parse_level(level_name: str) -> int:
    """Turn a level name such as "debug" or "TRACE" into its number."""
    register_trace_level()
    normalized_name = level_name.strip().upper()
    level = logging.getLevelName(normalized_name)
    if not isinstance(level, int):
        raise ValueError(f"Unknown log level: {level_name!r}")
    return level
