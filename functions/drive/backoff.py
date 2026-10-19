from __future__ import annotations

import random
import time
from typing import Callable, TypeVar

from .base import DriveQuotaError

T = TypeVar("T")


def with_backoff(
    fn: Callable[[], T],
    *,
    retries: int = 5,
    base_delay: float = 0.5,
    max_delay: float = 16.0,
    sleep: Callable[[float], None] = time.sleep,
) -> T:
    """Run ``fn`` retrying ``DriveQuotaError`` with exponential backoff + jitter."""
    attempt = 0
    while True:
        try:
            return fn()
        except DriveQuotaError:
            attempt += 1
            if attempt > retries:
                raise
            delay = min(max_delay, base_delay * (2 ** (attempt - 1)))
            sleep(delay + random.uniform(0, delay / 2))
