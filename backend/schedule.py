from datetime import datetime, date, time
from zoneinfo import ZoneInfo

from database import get_connection

LOCAL_TZ = ZoneInfo("Asia/Manila")


def _fmt_time(t: str) -> str:
    # "08:00:00" -> "8:00 AM"
    parsed = datetime.strptime(t[:5], "%H:%M")
    return parsed.strftime("%-I:%M %p") if False else parsed.strftime("%I:%M %p").lstrip("0")


def open_now(center_id: int, now: datetime | None = None) -> dict:
    now = now or datetime.now(LOCAL_TZ)
    today = now.date()
    weekday = now.weekday()  # Monday = 0
    current = now.time()

    conn = get_connection()
    center = conn.execute(
        "SELECT name FROM health_centers WHERE id = ?", (center_id,)
    ).fetchone()

    if center is None:
        conn.close()
        return {"error": "Center not found"}

    # 1. Specific-date rows (overrides, holidays, cancellations) take priority
    overrides = conn.execute(
        """
        SELECT service_name, start_time, end_time, is_cancelled
        FROM clinic_schedule
        WHERE health_center_id = ? AND specific_date = ?
        """,
        (center_id, today.isoformat()),
    ).fetchall()

    # 2. Weekly pattern, used only for services with no override today
    weekly = conn.execute(
        """
        SELECT service_name, start_time, end_time, is_cancelled
        FROM clinic_schedule
        WHERE health_center_id = ? AND day_of_week = ? AND specific_date IS NULL
        """,
        (center_id, weekday),
    ).fetchall()
    conn.close()

    overridden_services = {r["service_name"] for r in overrides}
    today_rows = list(overrides) + [r for r in weekly if r["service_name"] not in overridden_services]

    open_services = []
    for r in today_rows:
        if r["is_cancelled"]:
            continue
        if r["start_time"] and r["end_time"]:
            start = time.fromisoformat(r["start_time"])
            end = time.fromisoformat(r["end_time"])
            if start <= current <= end:
                open_services.append(
                    {
                        "service": r["service_name"],
                        "until": _fmt_time(r["end_time"]),
                    }
                )

    if open_services:
        return {
            "center": center["name"],
            "open_now": True,
            "services": open_services,
        }

    return {
        "center": center["name"],
        "open_now": False,
        "message": "Sirado karon.",
    }