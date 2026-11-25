import math
from datetime import datetime, timezone, timedelta
from database import get_connection
from freshness import freshness_state

TANDAG_CENTER = (9.0785, 126.1980)
PH_TZ = timezone(timedelta(hours=8))

STATUS_LABELS = {
    "in_stock": "Available",
    "low_stock": "Low Stock",
    "out_of_stock": "Out of Stock",
}

def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))

def _ph_time(utc_str):
    dt = datetime.fromisoformat(utc_str).replace(tzinfo=timezone.utc)
    return dt.astimezone(PH_TZ).strftime("%b %d, %Y %I:%M %p")

def find_nearby(item_name, lat, lng):
    conn = get_connection()
    centers = conn.execute(
        """
        SELECT id, name, barangay, contact_number, address, latitude, longitude
        FROM health_centers
        WHERE is_participating = 1
        """
    ).fetchall()
    config = conn.execute(
        "SELECT fresh_max_hours, aging_max_hours FROM freshness_config WHERE id = 1"
    ).fetchone()

    found = []
    excluded_stale = 0
    no_record = 0

    for c in centers:
        if c["latitude"] is None or c["longitude"] is None:
            continue

        distance = round(haversine_km(lat, lng, c["latitude"], c["longitude"]), 1)
        base = {
            "center": c["name"],
            "barangay": c["barangay"],
            "address": c["address"],
            "contact": c["contact_number"],
            "distance_km": distance,
            "lat": c["latitude"],   # ADDED FOR MAP
            "lng": c["longitude"],  # ADDED FOR MAP
        }

        if item_name is None:
            found.append(base)
            continue

        item = conn.execute(
            """
            SELECT id FROM items
            WHERE health_center_id = ? AND LOWER(name) = LOWER(?) AND is_active = 1
            """,
            (c["id"], item_name),
        ).fetchone()
        if item is None:
            continue

        status = conn.execute(
            """
            SELECT status, last_confirmed_at FROM stock_status
            WHERE item_id = ?
            ORDER BY status_changed_at DESC, id DESC
            LIMIT 1
            """,
            (item["id"],),
        ).fetchone()

        if status is None:
            no_record += 1
            continue

        f = freshness_state(
            status["last_confirmed_at"],
            config["fresh_max_hours"],
            config["aging_max_hours"],
        )
        if f["state"] == "stale":
            excluded_stale += 1
            continue

        found.append({
            **base,
            "availability": STATUS_LABELS[status["status"]],
            "in_stock": status["status"] in ("in_stock", "low_stock"),
            "last_confirmed_at": _ph_time(status["last_confirmed_at"]),
            "freshness": f["state"],
        })

    conn.close()

    found.sort(key=lambda x: (0 if x.get("in_stock") else 1, x["distance_km"]))

    return {
        "item": item_name,
        "centers": found,
        "excluded_stale": excluded_stale,
        "no_record": no_record,
    }