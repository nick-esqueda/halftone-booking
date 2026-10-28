"""The ID of the request being handled, attached to every log record.

A `ContextVar` holds the current request's ID. FastAPI copies the context
into the threads that run sync endpoints, so code anywhere in a request
sees the same ID without passing it around.

`install_request_id_on_records` wraps logging's record factory so each
record gets a `request_id` attribute when it is created. Doing it at
creation, instead of in a handler filter, means every handler sees it,
including pytest's `caplog`.
"""

import logging
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any

# Used on lines logged outside any request or `bind_request_id` block.
NO_REQUEST_ID = "none"

# Marks our record factory, so installing it twice doesn't wrap it twice.
FACTORY_MARKER = "adds_request_id"

_current_request_id: ContextVar[str] = ContextVar("request_id", default=NO_REQUEST_ID)


def get_request_id() -> str:
    return _current_request_id.get()


def set_request_id(request_id: str) -> None:
    """Use this ID for everything logged from here until the request ends."""
    _current_request_id.set(request_id)


@contextmanager
def bind_request_id(request_id: str) -> Iterator[None]:
    """Use a fixed ID for work outside a request, such as `startup` or `seed`."""
    token = _current_request_id.set(request_id)
    try:
        yield
    finally:
        _current_request_id.reset(token)


def install_request_id_on_records() -> None:
    base_factory = logging.getLogRecordFactory()
    if getattr(base_factory, FACTORY_MARKER, False):
        return

    def build_record(*args: Any, **kwargs: Any) -> logging.LogRecord:
        record = base_factory(*args, **kwargs)
        record.request_id = get_request_id()
        return record

    setattr(build_record, FACTORY_MARKER, True)
    logging.setLogRecordFactory(build_record)
