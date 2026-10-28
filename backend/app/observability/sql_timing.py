"""Logs database queries that take longer than a threshold, at DEBUG.

Only the start of the SQL is logged, never the parameters, because
parameters hold booking details. Turn on TRACE to see every statement.
"""

import logging
import time
from typing import Any

from sqlalchemy import Connection, Engine, event

# Where each connection keeps its query start times (a stack, for nesting).
QUERY_START_TIMES_KEY = "query_start_times"
MAX_LOGGED_STATEMENT_CHARS = 200
MILLISECONDS_PER_SECOND = 1000

slow_query_logger = logging.getLogger("app.db")


class SlowQueryLogger:
    """SQLAlchemy event listeners that time each query on an engine."""

    def __init__(self, threshold_ms: int) -> None:
        self.threshold_ms = threshold_ms

    def register(self, engine: Engine) -> None:
        event.listen(engine, "before_cursor_execute", self.remember_start)
        event.listen(engine, "after_cursor_execute", self.log_if_slow)

    def remember_start(self, connection: Connection, *_: Any) -> None:
        start_times = connection.info.setdefault(QUERY_START_TIMES_KEY, [])
        start_times.append(time.perf_counter())

    def log_if_slow(
        self, connection: Connection, cursor: Any, statement: str, *_: Any
    ) -> None:
        started_at = connection.info[QUERY_START_TIMES_KEY].pop()
        elapsed_seconds = time.perf_counter() - started_at
        duration_ms = round(elapsed_seconds * MILLISECONDS_PER_SECOND)
        if duration_ms <= self.threshold_ms:
            return

        statement_start = statement[:MAX_LOGGED_STATEMENT_CHARS]
        fields = {"duration_ms": duration_ms, "statement": statement_start}
        slow_query_logger.debug("Slow database query", extra=fields)
