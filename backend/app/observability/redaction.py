"""Masks secrets in log records before any sink writes them.

Every sink gets this filter (see `sinks.build_sink_handlers`), so a new
destination can't leak secrets by accident.

To mask another kind of field, add a word to `SENSITIVE_FIELD_WORDS`: any
`extra` field whose name contains it is replaced with `MASK`.
"""

import logging
import re

from app.observability.record_fields import collect_extra_fields

MASK = "***"

SENSITIVE_FIELD_WORDS = (
    "api_key",
    "authorization",
    "password",
    "token",
    "secret",
    "cookie",
)

# The password part of a URL such as postgresql://user:password@host/db.
URL_PASSWORD_PATTERN = re.compile(r"(://[^:/@\s]+:)[^@\s]+(@)")


def is_sensitive_field(field_name: str) -> bool:
    lowered_name = field_name.lower()
    return any(word in lowered_name for word in SENSITIVE_FIELD_WORDS)


def mask_url_passwords(text: str) -> str:
    return URL_PASSWORD_PATTERN.sub(rf"\g<1>{MASK}\g<2>", text)


def mask_field_value(field_name: str, value: object) -> object:
    if is_sensitive_field(field_name):
        return MASK
    if isinstance(value, str):
        return mask_url_passwords(value)
    return value


class RedactionFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        # Render the message once, masked, so formatters never see the raw text.
        record.msg = mask_url_passwords(record.getMessage())
        record.args = None

        for field_name, value in collect_extra_fields(record).items():
            setattr(record, field_name, mask_field_value(field_name, value))
        return True
