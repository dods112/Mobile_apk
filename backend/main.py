import os
from fastapi import FastAPI, HTTPException, Query, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta

from database import get_connection
from freshness import freshness_state
from intent import detect_intent
from schedule import open_now, list_services
from nearby import find_nearby, TANDAG_CENTER
from seed_data import reset_and_seed

PH_TZ = timezone(timedelta(hours=8))

NEARBY_WORDS = (
    "pinakaduol", "pinakaduol nga health center", "duol", "duol nga health center",
    "duol nga klinika", "duol nga ospital", "duol nga botika", "asa naa", "asa pa",
    "asa ang", "asa dapit", "asa dapit ang", "asa makita", "asa makit-an",
    "asa ko makakita", "asa ko moadto", "asa ta moadto", "asa ko makapa checkup",
    "asa makapalit og tambal", "naa bay duol", "naa bay duol diri", "naa bay health center",
    "unsa nga lugar", "unsay lokasyon", "lokasyon sa health center", "pila kalayo",
    "layo ba", "duol ra ba", "direksyon padulong", "unsaon pag-adto", "giunsa pag-adto",
    "agi padulong", "health center diri", "health center sa amo", "pinakamalapit",
    "pinakamalapit na health center", "malapit", "malapit na klinika", "malapit na ospital",
    "malapit na botika", "saan ang", "saan banda", "saan matatagpuan", "saan makikita",
    "nasaan ang", "may malapit ba", "may malapit dito", "health center dito",
    "lokasyon ng health center", "address ng health center", "direksyon papunta",
    "paano pumunta", "gaano kalayo", "malapit lang ba", "saan makakabili ng gamot",
    "nearest", "nearby", "near me", "closest", "closest to me", "near here",
    "nearby health center", "nearest health center", "nearest clinic", "nearest hospital",
    "nearest pharmacy", "health center location", "clinic location", "hospital location",
    "pharmacy location", "where is", "where can i find", "where can i go", "where to find",
    "where is located", "directions to", "how to get to", "how far", "distance to",
    "show me nearby", "find health center", "find a clinic", "health centers around me",
    "clinics around me", "center", "centro", "health center", "health centre", "clinic",
    "hospital", "pharmacy", "botika", "dispensary", "health facility", "medical facility"
)

def to_ph_time(utc_str: str) -> str:
    dt = datetime.fromisoformat(utc_str).replace(tzinfo=timezone.utc)
    return dt.astimezone(PH_TZ).strftime("%b %d, %Y %I:%M %p")

def verify_staff_pin(x_staff_pin: str = Header(None)):
    expected_pin = os.getenv("STAFF_PIN")
    if not expected_pin:
        return
    if x_staff_pin != expected_pin:
        raise HTTPException(status_code=401, detail="Invalid or missing Staff PIN")

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
    status: str
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
    lat: Optional[float] = Query(None),
    lng: Optional[float] = Query(None),
):
    user_lat = lat if lat is not None else TANDAG_CENTER[0]
    user_lng = lng if lng is not None else TANDAG_CENTER[1]
    return find_nearby(item, user_lat, user_lng)

@app.get("/api/chat")
def chat(
    message: str = Query(..., min_length=2),
    center: int = Query(1),
    lat: Optional[float] = Query(None),
    lng: Optional[float] = Query(None),
):
    lowered = message.lower()
    wants_nearby = any(word in lowered for word in NEARBY_WORDS)
    result = detect_intent(message, center)
    user_lat = lat if lat is not None else TANDAG_CENTER[0]
    user_lng = lng if lng is not None else TANDAG_CENTER[1]

    if result["intent"] == "greeting":
        return {"result": "text", "message": "Maayong adlaw! Welcome sa Tan-aw AI. Unsa akong ikatabang nimo karon?"}
    if result["intent"] == "thanks":
        return {"result": "text", "message": "Walay sapayan! Amping kanunay ug hinaot nga maayo imong panglawas!"}
    if result["intent"] == "medical_advice":
        return {"result": "text", "message": "Pasensya, ako usa lamang ka information assistant ug dili makahatag og medikal nga tambag o reseta. Palihug konsulta sa doktor o nurse sa health center para sa imong kahimtang."}

    if result["intent"] == "open_now":
        return open_now(center)

    if result["intent"] == "services":
        return list_services(center)
        
    if result["intent"] == "list_items":
        items_data = list_items(center)
        return {
            "result": "list_items",
            "items": items_data,
            "message": "Kini ang mga tambal nga naa sa among listahan karon:"
        }

    if wants_nearby and result["intent"] == "stock":
        return find_nearby(result["item"], user_lat, user_lng)

    if wants_nearby:
        return find_nearby(None, user_lat, user_lng)

    if result["intent"] == "stock":
        return check_stock(item=result["item"], center=center)

    return {"result": "unknown", "message": "Pasensya, wala ko kasabot. Pangutana bahin sa tambal, bakuna, o kung bukas ba ang center."}

@app.get("/api/centers")
def get_centers():
    conn = get_connection()
    rows = conn.execute("SELECT id, name, barangay, address, contact_number, latitude, longitude FROM health_centers ORDER BY name").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/medicines")
def list_medicines():
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT name, category, description, MAX(id) as id 
        FROM items 
        WHERE is_active = 1
        GROUP BY name, category, description
        ORDER BY name
        """
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

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

@app.post("/api/staff/update", dependencies=[Depends(verify_staff_pin)])
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
        "INSERT INTO stock_status (item_id, status, reason, expected_restock_date, updated_by) VALUES (?, ?, ?, ?, ?)",
        (data.item_id, data.status, data.reason, data.expected_restock_date, data.updated_by),
    )
    conn.execute(
        "INSERT INTO update_log (health_center_id, staff_name, action) VALUES (?, ?, ?)",
        (item["health_center_id"], data.updated_by, f"{item['name']}: {data.status}"),
    )
    conn.commit()
    conn.close()
    return {"ok": True, "item": item["name"], "status": STATUS_LABELS[data.status]}

@app.post("/api/staff/confirm", dependencies=[Depends(verify_staff_pin)])
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

@app.get("/api/staff/attention", dependencies=[Depends(verify_staff_pin)])
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
    config = conn.execute("SELECT fresh_max_hours, aging_max_hours FROM freshness_config WHERE id = 1").fetchone()
    conn.close()

    flagged = []
    for r in rows:
        if r["last_confirmed_at"] is None:
            flagged.append({"name": r["name"], "reason": "no_record"})
            continue
        f = freshness_state(r["last_confirmed_at"], config["fresh_max_hours"], config["aging_max_hours"])
        if f["state"] != "fresh":
            flagged.append({"name": r["name"], "reason": f["state"], "hours_since_confirmed": f["hours_since_confirmed"]})
    return {"count": len(flagged), "items": flagged}