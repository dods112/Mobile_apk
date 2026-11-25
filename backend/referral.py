import secrets
from datetime import datetime, timedelta, timezone

from database import get_connection
from freshness import freshness_state
from nearby import haversine_km

PH_TZ = timezone(timedelta(hours=8))
REFERRAL_HOURS = 24
# No 0, O, 1, or I, so codes are easy to read aloud and write down
CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

TEXT = {
    "en": {
        "found": "This item is out of stock here. Show this code at the health center below to be referred.",
        "none": "This item is out of stock here, and no nearby center has a current record. Please call your health center for help.",
    },
    "ceb": {
        "found": "Wala kini sa kini nga center. Ipakita kini nga code sa health center sa ubos aron ma-refer ka.",
        "none": "Wala kini sa kini nga center ug walay duol nga center nga naay kasaligan nga rekord. Tawag una sa imong health center para sa tabang.",
    },
}


def _text(lang: str, key: str) -> str:
    return TEXT.get(lang, TEXT["en"])[key]


def _ph(dt: datetime) -> str:
    return dt.astimezone(PH_TZ).strftime("%b %d, %Y %I:%M %p")


def ensure_table():
    # No foreign keys on purpose, so reseeding the medicine list never fails on old referrals
    conn = get_connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS referrals (
                id INTEGER PRIMARY KEY,
                code TEXT UNIQUE NOT NULL,
                item_id INTEGER NOT NULL,
                from_center_id INTEGER NOT NULL,
                to_center_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def _new_code(conn) -> str:
    while True:
        code = "REF-" + "".join(secrets.choice(CODE_CHARS) for _ in range(6))
        exists = conn.execute("SELECT 1 FROM referrals WHERE code = ?", (code,)).fetchone()
        if not exists:
            return code


def build_referral(item_name: str, item_id: int, from_center_id: int, lang: str = "en") -> dict:
    ensure_table()
    conn = get_connection()
    try:
        origin = conn.execute(
            "SELECT latitude, longitude FROM health_centers WHERE id = ?",
            (from_center_id,),
        ).fetchone()
        config = conn.execute(
            "SELECT fresh_max_hours, aging_max_hours FROM freshness_config WHERE id = 1"
        ).fetchone()

        # Same item name at other participating centers
        candidates = conn.execute(
            """
            SELECT i.id AS item_id, c.id AS center_id, c.name, c.address,
                   c.contact_number, c.latitude, c.longitude
            FROM items i
            JOIN health_centers c ON c.id = i.health_center_id
            WHERE LOWER(i.name) = LOWER(?)
              AND i.is_active = 1
              AND c.is_participating = 1
              AND c.id != ?
            """,
            (item_name, from_center_id),
        ).fetchall()

        best = None
        best_distance = None

        for c in candidates:
            status = conn.execute(
                """
                SELECT status, last_confirmed_at FROM stock_status
                WHERE item_id = ?
                ORDER BY status_changed_at DESC, id DESC
                LIMIT 1
                """,
                (c["item_id"],),
            ).fetchone()

            # Only centers that have it in stock and recent information
            if status is None or status["status"] not in ("in_stock", "low_stock"):
                continue

            f = freshness_state(
                status["last_confirmed_at"],
                config["fresh_max_hours"],
                config["aging_max_hours"],
            )
            if f["state"] == "stale":
                continue

            if origin and origin["latitude"] is not None and c["latitude"] is not None:
                distance = haversine_km(
                    origin["latitude"], origin["longitude"], c["latitude"], c["longitude"]
                )
            else:
                distance = float("inf")

            if best is None or distance < best_distance:
                best, best_distance = c, distance

        if best is None:
            return {"found": False, "note": _text(lang, "none")}

        code = _new_code(conn)
        now = datetime.now(timezone.utc)
        expires = now + timedelta(hours=REFERRAL_HOURS)

        conn.execute(
            """
            INSERT INTO referrals (code, item_id, from_center_id, to_center_id, created_at, expires_at)
            VALUES (?,?,?,?,?,?)
            """,
            (code, item_id, from_center_id, best["center_id"], now.isoformat(), expires.isoformat()),
        )
        conn.commit()
    finally:
        conn.close()

    distance_km = None if best_distance == float("inf") else round(best_distance, 1)

    return {
        "found": True,
        "code": code,
        "to_center": best["name"],
        "to_address": best["address"],
        "to_contact": best["contact_number"],
        "distance_km": distance_km,
        "expires": _ph(expires),
        "note": _text(lang, "found"),
    }