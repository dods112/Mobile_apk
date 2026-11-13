from datetime import datetime, timezone


def freshness_state(last_confirmed_at: str, fresh_max_hours=24, aging_max_hours=48) -> dict:
    # SQLite CURRENT_TIMESTAMP is UTC, so treat the stored value as UTC
    confirmed = datetime.fromisoformat(last_confirmed_at).replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    hours = (now - confirmed).total_seconds() / 3600

    if hours < 0:
        hours = 0.0

    if hours <= fresh_max_hours:
        state = "fresh"
    elif hours <= aging_max_hours:
        state = "aging"
    else:
        state = "stale"

    return {"state": state, "hours_since_confirmed": round(hours, 1)}