"""GPS freshness classification. Stale data must never be presented as current."""
from datetime import datetime, timezone
from enum import StrEnum

from ..config import settings


class Freshness(StrEnum):
    REALTIME = "realtime"
    DELAYED = "delayed"
    OFFLINE = "offline"
    UNKNOWN = "unknown"  # never reported


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def classify(last_seen: datetime | None, now: datetime | None = None) -> tuple[Freshness, float | None]:
    if last_seen is None:
        return Freshness.UNKNOWN, None
    now = now or datetime.now(timezone.utc)
    age = max(0.0, (now - _aware(last_seen)).total_seconds())
    if age <= settings.gps_realtime_max_age_s:
        return Freshness.REALTIME, age
    if age <= settings.gps_delayed_max_age_s:
        return Freshness.DELAYED, age
    return Freshness.OFFLINE, age
