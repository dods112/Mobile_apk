from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta

from database import get_connection
from freshness import freshness_state
from intent import detect_intent
from schedule import open_now
from nearby import find_nearby, TANDAG_CENTER
from seed_data import reset_and_seed


PH_TZ = timezone(timedelta(hours=8))

# Words that ask for the nearest center
NEARBY_WORDS = ("pinakaduol", "duol", "nearest", "nearby", "asa naa", "asa pa", "asa ang")


def to_ph_time(utc_str: str) -> str:
    dt = datetime.fromisoformat(utc_str).replace(tzinfo=timezone.utc)
    return dt.astimezone(PH_TZ).strftime("%b %d, %Y %I:%M %p")


app = FastAPI(title="Tan-aw AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

reset_and_seed()

STATUS_LABELS = {
    "in_stock": "Available",
    "low_stock": "Low Stock",
    "out_of_stock": "Out of Stock",
}


class StockUpdate(BaseModel):
    item_id: int
    status: str  # in_stock / low_stock / out_of_stock
    updated_by: str
    reason: Optional[str] = None
    expected_restock_date: Optional[str] = None


@app.get("/")
def root():
    return {"status": "Tan-aw AI is running"}


@app.get("/api/stock")
def check_stock(item: str = Query(..., min_length=2), center: int = Query(...)):
    conn = get_connection()

    row = conn.execute(
        """
        SELECT i.id, i.name
        FROM items i
        LEFT JOIN item_aliases a ON a.item_id = i.id
        WHERE i.health_center_id = ?
          AND i.is_active = 1
          AND (LOWER(a.alias) = LOWER(?) OR LOWER(i.name) = LOWER(?))
        LIMIT 1
        """,
        (center, item, item),
    ).fetchone()

    if row is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Item not found at this center")

    status = conn.execute(
        """
        SELECT status, reason, expected_restock_date, updated_by,
               status_changed_at, last_confirmed_at
        FROM stock_status
        WHERE item_id = ?
        ORDER BY status_changed_at DESC, id DESC
        LIMIT 1
        """,
        (row["id"],),
    ).fetchone()

    config = conn.execute(
        "SELECT fresh_max_hours, aging_max_hours FROM freshness_config WHERE id = 1"
    ).fetchone()
    conn.close()

    if status is None:
        return {
            "item": row["name"],
            "result": "no_current_record",
            "message": "Walay kasaligan nga rekord niini sa health center na. Dili nagpasabot nga wala kini.",
        }

    freshness = freshness_state(
        status["last_confirmed_at"],
        config["fresh_max_hours"],
        config["aging_max_hours"],
    )

    return {
        "item": row["name"],
        "availability": STATUS_LABELS[status["status"]],
        "status_changed_at": to_ph_time(status["status_changed_at"]),
        "last_confirmed_at": to_ph_time(status["last_confirmed_at"]),
        "freshness": freshness["state"],
        "hours_since_confirmed": freshness["hours_since_confirmed"],
        "warning": (
            "Mahimong daan na ang impormasyon." if freshness["state"] == "stale" else None
        ),
    }


@app.get("/api/open-now")
def check_open_now(center: int = Query(...)):
    return open_now(center)


@app.get("/api/nearby")
def nearby(
    item: Optional[str] = Query(None),
    lat: float = Query(TANDAG_CENTER[0]),
    lng: float = Query(TANDAG_CENTER[1]),
):
    return find_nearby(item, lat, lng)


@app.get("/api/chat")
def chat(message: str = Query(..., min_length=2), center: int = Query(1)):
    lowered = message.lower()
    wants_nearby = any(word in lowered for word in NEARBY_WORDS)

    result = detect_intent(message, center)

    if result["intent"] == "open_now":
        return open_now(center)

    if wants_nearby and result["intent"] == "stock":
        return find_nearby(result["item"], *TANDAG_CENTER)

    if wants_nearby:
        return find_nearby(None, *TANDAG_CENTER)

    if result["intent"] == "stock":
        return check_stock(item=result["item"], center=center)

    return {
        "result": "unknown",
        "message": "Pasensya, wala ko kasabot. Pangutana bahin sa tambal, bakuna, o kung bukas ba ang center.",
    }


@app.post("/api/staff/update")
def update_stock(data: StockUpdate):
    if data.status not in STATUS_LABELS:
        raise HTTPException(status_code=400, detail="Invalid status")

    conn = get_connection()
    item = conn.execute(
        "SELECT health_center_id, name FROM items WHERE id = ?", (data.item_id,)
    ).fetchone()
    if item is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Item not found")

    conn.execute(
        """
        INSERT INTO stock_status (item_id, status, reason, expected_restock_date, updated_by)
        VALUES (?, ?, ?, ?, ?)
        """,
        (data.item_id, data.status, data.reason, data.expected_restock_date, data.updated_by),
    )
    conn.execute(
        "INSERT INTO update_log (health_center_id, staff_name, action) VALUES (?, ?, ?)",
        (item["health_center_id"], data.updated_by, f"{item['name']}: {data.status}"),
    )
    conn.commit()
    conn.close()
    return {"ok": True, "item": item["name"], "status": STATUS_LABELS[data.status]}


@app.post("/api/staff/confirm")
def confirm_stock(item_id: int = Query(...), updated_by: str = Query(...)):
    conn = get_connection()
    conn.execute(
        """
        UPDATE stock_status
        SET last_confirmed_at = CURRENT_TIMESTAMP, updated_by = ?
        WHERE id = (
            SELECT id FROM stock_status
            WHERE item_id = ?
            ORDER BY status_changed_at DESC, id DESC
            LIMIT 1
        )
        """,
        (updated_by, item_id),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


@app.get("/api/items")
def list_items(center: int = Query(...)):
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT i.id, i.name, i.category,
               s.status, s.last_confirmed_at, s.updated_by
        FROM items i
        LEFT JOIN stock_status s ON s.id = (
            SELECT id FROM stock_status
            WHERE item_id = i.id
            ORDER BY status_changed_at DESC, id DESC
            LIMIT 1
        )
        WHERE i.health_center_id = ? AND i.is_active = 1
        ORDER BY i.name
        """,
        (center,),
    ).fetchall()
    conn.close()

    return [
        {
            "item_id": r["id"],
            "name": r["name"],
            "category": r["category"],
            "status_key": r["status"],
            "availability": STATUS_LABELS.get(r["status"], "No Current Record"),
            "last_confirmed_at": to_ph_time(r["last_confirmed_at"]) if r["last_confirmed_at"] else None,
            "updated_by": r["updated_by"],
        }
        for r in rows
    ]


@app.get("/api/staff/attention")
def needs_attention(center: int = Query(...)):
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT i.name, s.last_confirmed_at
        FROM items i
        LEFT JOIN stock_status s ON s.id = (
            SELECT id FROM stock_status
            WHERE item_id = i.id
            ORDER BY status_changed_at DESC, id DESC
            LIMIT 1
        )
        WHERE i.health_center_id = ? AND i.is_active = 1
        """,
        (center,),
    ).fetchall()
    config = conn.execute(
        "SELECT fresh_max_hours, aging_max_hours FROM freshness_config WHERE id = 1"
    ).fetchone()
    conn.close()

    flagged = []
    for r in rows:
        if r["last_confirmed_at"] is None:
            flagged.append({"name": r["name"], "reason": "no_record"})
            continue
        f = freshness_state(
            r["last_confirmed_at"],
            config["fresh_max_hours"],
            config["aging_max_hours"],
        )
        if f["state"] != "fresh":
            flagged.append({
                "name": r["name"],
                "reason": f["state"],
                "hours_since_confirmed": f["hours_since_confirmed"],
            })

    return {"count": len(flagged), "items": flagged}

@app.get("/api/_debug")
def debug():
    conn = get_connection()
    centers = conn.execute("SELECT id, name FROM health_centers").fetchall()
    conn.close()
    return {"centers": [dict(r) for r in centers], "count": len(centers)}