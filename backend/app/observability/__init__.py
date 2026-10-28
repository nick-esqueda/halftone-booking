"""Logging for the whole API: levels, request IDs, formats and destinations.

How the pieces fit together:

- `setup.configure_logging` reads the settings once at startup and wires
  everything below onto Python's root logger.
- `levels` adds a TRACE level below DEBUG.
- `request_context` holds the current request's ID and stamps it on every
  log record. `request_logging_middleware` sets that ID for each request
  and logs one line when the request finishes.
- `formatters` turn records into readable console lines or JSON lines.
- `sinks` is the registry of destinations (console, file, stdout-json).
- `redaction` masks secrets before any sink writes a record.
- `sql_timing` logs slow database queries.

Code elsewhere only needs `logger = logging.getLogger(__name__)` and
`logger.info("Something happened", extra={"booking_id": 42})`.
"""
