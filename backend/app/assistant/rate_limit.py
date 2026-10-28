"""A small in-memory rate limit for assistant requests, keyed by client address.

In-memory is enough for one API process. With several processes, each keeps
its own count; move this to the database or Redis if that ever matters.
"""

import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable


class SlidingWindowRateLimiter:
    """Allows at most `max_requests` per key in any `window_seconds` period."""

    def __init__(
        self,
        max_requests: int,
        window_seconds: float,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.monotonic = monotonic
        self.request_times: dict[str, deque[float]] = defaultdict(deque)
        self.lock = threading.Lock()

    def allow(self, key: str) -> bool:
        """Record a request for `key` and say whether it's within the limit."""
        now = self.monotonic()
        with self.lock:
            times = self.request_times[key]
            while times and now - times[0] >= self.window_seconds:
                times.popleft()
            if len(times) >= self.max_requests:
                return False
            times.append(now)
            return True
