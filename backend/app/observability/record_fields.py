"""Finds the structured fields a log call added with `extra={...}`."""

import logging

# Attributes every LogRecord has. Anything else on a record came from `extra`.
STANDARD_RECORD_FIELDS = frozenset(
    vars(logging.LogRecord("", 0, "", 0, "", None, None))
) | {"message", "asctime", "request_id"}

# Extras other libraries add that only repeat the message.
# uvicorn adds `color_message`, a copy of the message with terminal colors.
IGNORED_EXTRA_FIELDS = frozenset({"color_message"})

HIDDEN_FIELDS = STANDARD_RECORD_FIELDS | IGNORED_EXTRA_FIELDS


def collect_extra_fields(record: logging.LogRecord) -> dict[str, object]:
    return {
        key: value for key, value in vars(record).items() if key not in HIDDEN_FIELDS
    }
