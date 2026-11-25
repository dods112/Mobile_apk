from datetime import datetime, timedelta, time as dtime
from zoneinfo import ZoneInfo

from database import get_connection

LOCAL_TZ = ZoneInfo("Asia/Manila")


def _fmt_time(t: str) -> str:
    # Handles "08:00" and "08:00:00"
    return dtime.fromisoformat(t).strftime("%I:%M %p").lstrip("0")


def _is_open(rows, current_time):
    for r in rows:
        if r["is_cancelled"]:
            continue
        if r["start_time"] and r["end_time"]:
            start = dtime.fromisoformat(r["start_time"])
            end = dtime.fromisoformat(r["end_time"])
            if start <= current_time <= end:
                return {"service": r["service_name"], "until": _fmt_time(r["end_time"])}
    return None


def _rows_for_day(conn, center_id: int, day, weekday: int):
    # Specific-date rows (holidays, overrides) take priority over the weekly pattern
    overrides = conn.execute(
        "SELECT * FROM clinic_schedule WHERE health_center_id = ? AND specific_date = ?",
        (center_id, day.isoformat()),
    ).fetchall()
    weekly = conn.execute(
        """
        SELECT * FROM clinic_schedule
        WHERE health_center_id = ? AND day_of_week = ? AND specific_date IS NULL
        """,
        (center_id, weekday),
    ).fetchall()
    return list(overrides) + list(weekly)


def next_opening(center_id: int, now: datetime) -> dict | None:
    # Looks up to 8 days ahead and returns the earliest opening after "now"
    conn = get_connection()
    try:
        for offset in range(8):
            day = now.date() + timedelta(days=offset)
            rows = _rows_for_day(conn, center_id, day, day.weekday())

            candidates = []
            for r in rows:
                if r["is_cancelled"] or not r["start_time"]:
                    continue
                start = dtime.fromisoformat(r["start_time"])
                if offset == 0 and start <= now.time():
                    continue
                candidates.append((start, r))

            if candidates:
                start, r = min(candidates, key=lambda x: x[0])
                if offset == 0:
                    when = "today"
                elif offset == 1:
                    when = "tomorrow"
                else:
                    when = day.strftime("%A")
                return {
                    "when": when,
                    "time": _fmt_time(r["start_time"]),
                    "service": r["service_name"],
                }
        return None
    finally:
        conn.close()


def open_now(center_id: int, now: datetime | None = None) -> dict:
    now = now or datetime.now(LOCAL_TZ)
    today = now.date()
    weekday = now.weekday()
    current = now.time()

    conn = get_connection()

    center = conn.execute(
        "SELECT name FROM health_centers WHERE id = ?", (center_id,)
    ).fetchone()
    if center is None:
        conn.close()
        return {"error": "Center not found"}

    main_open = _is_open(_rows_for_day(conn, center_id, today, weekday), current)

    other_centers = conn.execute(
        "SELECT id, name FROM health_centers WHERE id != ?", (center_id,)
    ).fetchall()

    other_open = []
    for oc in other_centers:
        oc_status = _is_open(_rows_for_day(conn, oc["id"], today, weekday), current)
        if oc_status:
            other_open.append({
                "center": oc["name"],
                "service": oc_status["service"],
                "until": oc_status["until"],
            })

    conn.close()

    result = {"center": center["name"], "open_now": bool(main_open)}

    if main_open:
        result["services"] = [main_open]
    else:
        result["message"] = "Sirado karon."
        result["next_open"] = next_opening(center_id, now)

    if other_open:
        result["other_open"] = other_open

    return result


def list_services(center_id: int) -> dict:
    conn = get_connection()
    center = conn.execute(
        "SELECT name FROM health_centers WHERE id = ?", (center_id,)
    ).fetchone()
    if center is None:
        conn.close()
        return {"error": "Center not found"}

    rows = conn.execute(
        """
        SELECT DISTINCT service_name FROM clinic_schedule
        WHERE health_center_id = ? AND is_cancelled = 0
        """,
        (center_id,),
    ).fetchall()
    conn.close()

    services = [r["service_name"] for r in rows]
    if not services:
        return {
            "center": center["name"],
            "services": [],
            "message": "Wala pay natala nga serbisyo.",
        }
    return {"center": center["name"], "services": services}