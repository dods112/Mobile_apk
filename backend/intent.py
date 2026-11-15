import re
from database import get_connection

OPEN_KEYWORDS = ["open", "bukas", "sirado", "closed"]
SERVICES_KEYWORDS = ["serbisyo", "services", "checkup", "consultation"]


def normalize(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s]", " ", text)
    return re.sub(r"\s+", " ", text)


def find_item(text: str, center_id: int):
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT i.id, i.name, a.alias
        FROM items i
        LEFT JOIN item_aliases a ON a.item_id = i.id
        WHERE i.health_center_id = ? AND i.is_active = 1
        """,
        (center_id,),
    ).fetchall()
    conn.close()

    clean = normalize(text)
    for row in rows:
        candidates = {normalize(row["name"]).split()[0]}
        if row["alias"]:
            candidates.add(normalize(row["alias"]))
        if any(c in clean.split() for c in candidates):
            return row["name"]
    return None


def detect_intent(text: str, center_id: int = 1) -> dict:
    clean = normalize(text)
    words = set(clean.split())

    if any(k in words for k in OPEN_KEYWORDS):
        return {"intent": "open_now", "center": center_id}

    if any(k in words for k in SERVICES_KEYWORDS):
        return {"intent": "services", "center": center_id}

    item = find_item(clean, center_id)
    if item:
        return {"intent": "stock", "item": item, "center": center_id}

    return {"intent": "unknown"}