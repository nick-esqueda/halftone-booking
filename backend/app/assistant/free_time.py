"""Finding the gaps between busy periods. Pure functions, easy to test."""

from collections.abc import Iterable
from datetime import datetime, timedelta

from app.services.booking_times import TimeSpan


def find_free_spans(
    window: TimeSpan, busy_spans: Iterable[TimeSpan], min_length: timedelta
) -> list[TimeSpan]:
    """The parts of `window` not covered by any busy span, at least `min_length` long."""
    free_spans: list[TimeSpan] = []
    gap_start = window.starts_at

    for busy in sorted(busy_spans, key=lambda span: span.starts_at):
        if busy.starts_at > gap_start:
            gap_end = min(busy.starts_at, window.ends_at)
            _add_if_long_enough(free_spans, gap_start, gap_end, min_length)
        gap_start = max(gap_start, busy.ends_at)

    _add_if_long_enough(free_spans, gap_start, window.ends_at, min_length)
    return free_spans


def _add_if_long_enough(
    spans: list[TimeSpan], starts_at: datetime, ends_at: datetime, min_length: timedelta
) -> None:
    if ends_at - starts_at >= min_length:
        spans.append(TimeSpan(starts_at=starts_at, ends_at=ends_at))


def round_up_to_step(value: datetime, step_minutes: int) -> datetime:
    """The first time on the booking step at or after `value`, e.g. 10:07 → 10:15."""
    start_of_hour = value.replace(minute=0, second=0, microsecond=0)
    minutes_into_hour = (value - start_of_hour) / timedelta(minutes=1)
    steps = -(-minutes_into_hour // step_minutes)  # Ceiling division.
    return start_of_hour + timedelta(minutes=steps * step_minutes)
