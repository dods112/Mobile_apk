import os
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import get_connection
from freshness import freshness_state
from intent import detect_intent, CLARIFY
from answers import bank_detect
from lang import detect as detect_lang
from context import ensure_context_table, user_key, load_context, save_context
from llm_guard import check as scope_check
from schedule import open_now, list_services
from nearby import find_nearby, TANDAG_CENTER
from referral import build_referral
from seed_data import reset_and_seed
from auth import router as auth_router, ensure_auth_tables, seed_admin, check_staff_access
from admin_api import router as admin_router
from history_api import router as history_router, ensure_history_tables
from staff_reports import router as staff_router

PH_TZ = timezone(timedelta(hours=8))

NEARBY_WORDS = (
    "pinakaduol", "duol", "asa naa", "asa pa", "asa ang", "asa dapit",
    "nearest", "nearby", "near me", "find health center",
)

STATUS_LABELS = {
    "in_stock": "Available",
    "low_stock": "Low Stock",
    "out_of_stock": "Out of Stock",
}

TEXT = {
    "en": {
        "greeting": "Good day! Welcome to Capsule AI.",
        "thanks": "You're welcome! Take care.",
        "medical": "Sorry, I cannot give medical advice. Please ask a doctor.",
        "services_none": "No services are listed yet.",
        "services_prefix": "Services at",
        "items_none": "No medicines or vaccines are listed at this center.",
        "no_center": "I could not find that health center.",
        "unknown": "Sorry, I did not understand. Ask about medicine, vaccines, opening hours, or the nearest center.",
        "stale_warning": "This information may be outdated.",
        "no_record": "No reliable record for this item at this health center. This does not mean it is out of stock.",
    },
    "ceb": {
        "greeting": "Maayong adlaw! Welcome sa Capsule AI.",
        "thanks": "Walay sapayan! Amping kanunay.",
        "medical": "Pasensya, dili ko makahatag og medikal nga tambag. Palihug konsulta sa doktor.",
        "services_none": "Wala pay natala nga serbisyo.",
        "services_prefix": "Mga serbisyo sa",
        "items_none": "Walay tambal o bakuna nga narehistro sa center na.",
        "no_center": "Wala ko makit-an nga health center.",
        "unknown": "Pasensya, wala ko kasabot. Pangutana bahin sa tambal, bakuna, oras, o pinakaduol nga center.",
        "stale_warning": "Mahimong daan na ang impormasyon.",
        "no_record": "Walay kasaligan nga rekord niini sa health center na. Dili kini nagpasabot nga wala na.",
    },
}


def tx(lang: str, key: str) -> str:
    pack = TEXT.get(lang, TEXT["en"])
    return pack.get(key, TEXT["en"][key])


def normalize_lang(lang: Optional[str]) -> str:
    return "ceb" if lang == "ceb" else "en"


def to_ph_time(utc_str: Optional[str]) -> Optional[str]:
    if not utc_str:
        return None
    dt = datetime.fromisoformat(utc_str).replace(tzinfo=timezone.utc)
    return dt.astimezone(PH_TZ).strftime("%b %d, %Y %I:%M %p")


def verify_staff_pin(x_staff_pin: str = Header(None), x_auth_token: str = Header(None)):
    # Staff must be signed in, or give the backup PIN
    check_staff_access(x_auth_token, x_staff_pin)


app = FastAPI(title="Capsule AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

reset_and_seed()
ensure_auth_tables()
seed_admin()
app.include_router(auth_router)
app.include_router(admin_router)
ensure_history_tables()
from database import ensure_english_column
ensure_english_column()
app.include_router(history_router)
app.include_router(staff_router)
ensure_context_table()


class StockUpdate(BaseModel):
    item_id: int
    status: str
    updated_by: str
    reason: Optional[str] = None
    expected_restock_date: Optional[str] = None


class ResidentReport(BaseModel):
    health_center_id: int
    report_type: str
    details: str


def _freshness_config(conn):
    return conn.execute(
        "SELECT fresh_max_hours, aging_max_hours FROM freshness_config WHERE id = 1"
    ).fetchone()


def _latest_status(conn, item_id: int):
    return conn.execute(
        """
        SELECT status, status_changed_at, last_confirmed_at
        FROM stock_status
        WHERE item_id = ?
        ORDER BY status_changed_at DESC, id DESC
        LIMIT 1
        """,
        (item_id,),
    ).fetchone()


def _find_item_row(conn, center_id: int, query: str):
    return conn.execute(
        """
        SELECT i.id, i.name
        FROM items i
        LEFT JOIN item_aliases a ON a.item_id = i.id
        WHERE i.health_center_id = ?
          AND i.is_active = 1
          AND (LOWER(a.alias) = LOWER(?) OR LOWER(i.name) = LOWER(?))
        LIMIT 1
        """,
        (center_id, query, query),
    ).fetchone()


def _global_item(query: str):
    # Finds the item at any center, so a referral can name the medicine
    conn = get_connection()
    row = conn.execute(
        """
        SELECT i.id, i.name
        FROM items i
        LEFT JOIN item_aliases a ON a.item_id = i.id
        WHERE i.is_active = 1
          AND (LOWER(a.alias) = LOWER(?) OR LOWER(i.name) = LOWER(?))
        LIMIT 1
        """,
        (query, query),
    ).fetchone()
    conn.close()
    return row


def _items_reply(center_id: int, lang: str) -> dict:
    conn = get_connection()
    rows = conn.execute(
        "SELECT name, category FROM items WHERE health_center_id = ? AND is_active = 1 ORDER BY category, name",
        (center_id,),
    ).fetchall()
    conn.close()

    if not rows:
        return {"result": "text", "message": tx(lang, "items_none")}

    medicines = [r["name"] for r in rows if r["category"] != "vaccine"]
    vaccines = [r["name"] for r in rows if r["category"] == "vaccine"]

    if lang == "ceb":
        meds_label, vacc_label, intro = "Mga tambal", "Mga bakuna", "Kini ang available sa center:"
    else:
        meds_label, vacc_label, intro = "Medicines", "Vaccines", "Here is what this center has:"

    return {
        "result": "list",
        "intro": intro,
        "groups": [
            {"label": meds_label, "items": medicines},
            {"label": vacc_label, "items": vaccines},
        ],
    }


def _services_text(center_id: int, lang: str) -> str:
    data = list_services(center_id)
    if "error" in data:
        return tx(lang, "no_center")
    if not data["services"]:
        return tx(lang, "services_none")
    return f"{tx(lang, 'services_prefix')} {data['center']}: " + ", ".join(data["services"]) + "."


@app.get("/")
def root():
    return {"status": "Capsule AI is running"}


def _item_description(item_id):
    c = get_connection()
    r = c.execute("SELECT description FROM items WHERE id = ?", (item_id,)).fetchone()
    c.close()
    return r["description"] if r else None

@app.get("/api/stock")
def check_stock(
    item: str = Query(..., min_length=2),
    center: int = Query(...),
    lang: str = Query("en"),
):
    lang = normalize_lang(lang)
    conn = get_connection()
    row = _find_item_row(conn, center, item)

    # Not carried at this center: refer to a center that has it
    if row is None:
        conn.close()
        other = _global_item(item)
        if other is None:
            raise HTTPException(status_code=404, detail="Item not found")
        return {
            "item": other["name"],
            "result": "not_carried",
            "referral": build_referral(other["name"], other["id"], center, lang),
        }

    status = _latest_status(conn, row["id"])
    config = _freshness_config(conn)
    conn.close()

    # No current record here: refer if another center has it
    if status is None:
        return {
            "item": row["name"],
            "result": "no_current_record",
            "message": tx(lang, "no_record"),
            "referral": build_referral(row["name"], row["id"], center, lang),
        }

    f = freshness_state(
        status["last_confirmed_at"],
        config["fresh_max_hours"],
        config["aging_max_hours"],
    )

    result = {
        "item": row["name"],
        "availability": STATUS_LABELS[status["status"]],
        "description": _item_description(row["id"]),
        "status_changed_at": to_ph_time(status["status_changed_at"]),
        "last_confirmed_at": to_ph_time(status["last_confirmed_at"]),
        "freshness": f["state"],
        "hours_since_confirmed": f["hours_since_confirmed"],
        "warning": tx(lang, "stale_warning") if f["state"] == "stale" else None,
    }

    # Out of stock here: refer if another center has it
    if status["status"] == "out_of_stock":
        result["referral"] = build_referral(row["name"], row["id"], center, lang)

    return result


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


PRICE_TEXT = {
    "en": "Medicine prices and free-medicine programs are not recorded yet. Please ask the health center directly.",
    "ceb": "Wala pa natala ang presyo o libre nga tambal sa sistema. Pangutana direkta sa health center.",
}


def _route_chat(intent, cid, item, clarify_key, lang, ulat, ulng):
    if intent == "medicine_info":
        if not item:
            return {"result": "text", "message": tx(lang, "unknown")}
        conn = get_connection()
        row = conn.execute(
            "SELECT description, description_en FROM items WHERE name = ? AND is_active = 1 LIMIT 1",
            (item,),
        ).fetchone()
        conn.close()
        desc = (row["description_en"] or row["description"]) if (row and lang == "en") else (row["description"] if row else None)
        if desc is None:
            desc = "Walay nalista nga detalye." if lang == "ceb" else "No description is listed for this product yet."
        if lang == "ceb":
            note = "Para sa stock, pangutana: naa ba ang " + item + "?"
        else:
            note = "To check stock, ask: is " + item + " available?"
        return {"result": "info", "item": item, "description": desc, "note": note}
    if intent == "greeting":
        return {"result": "text", "message": tx(lang, "greeting")}
    if intent == "acknowledge":
        return {"result": "text", "message": "Sige. Unsa pa ang gusto nimo?" if lang == "ceb" else "Okay. What else would you like to know?"}
    if intent == "thanks":
        return {"result": "text", "message": tx(lang, "thanks")}
    if intent in ("medical_advice", "general_health_information"):
        return {"result": "text", "message": tx(lang, "medical")}
    if intent == "clarification":
        return {"result": "text", "message": CLARIFY[clarify_key][lang]}
    if intent in ("medicine_price", "free_medicine_inquiry", "purchase_info"):
        return {"result": "text", "message": PRICE_TEXT[lang]}
    if intent == "clinic_hours":
        return open_now(cid)
    if intent == "health_services":
        return {"result": "text", "message": _services_text(cid, lang)}
    if intent in ("find_health_center", "alternative_health_center"):
        return find_nearby(item if intent == "alternative_health_center" else None, ulat, ulng)
    if intent == "find_medicine_location":
        if item:
            return find_nearby(item, ulat, ulng)
        return {"result": "text", "message": CLARIFY[clarify_key or "purchase_or_center"][lang]}
    if intent in ("medicine_availability", "vaccine_availability"):
        if item:
            return check_stock(item=item, center=cid, lang=lang)
        return {"result": "text", "message": tx(lang, "unknown")}
    if intent in ("medicine_search", "center_availability"):
        return _items_reply(cid, lang)
    return {"result": "unknown", "message": tx(lang, "unknown")}


def _with_description(reply, center_id):
    if not isinstance(reply, dict) or not reply.get("item"):
        return _with_description(reply, cid)
    conn = get_connection()
    row = conn.execute(
        "SELECT description, category FROM items WHERE health_center_id = ? AND name = ? AND is_active = 1 LIMIT 1",
        (center_id, reply["item"]),
    ).fetchone()
    conn.close()
    if row and row["description"]:
        reply["description"] = row["description"]
    status = reply.get("availability")
    if status == "Out of Stock":
        reply["guidance"] = "Tawag una sa imong health center bago moadto, o tan-awa ang referral sa ubos." if False else "Call your health center before you go. A referral is shown below."
    elif status == "Low Stock":
        reply["guidance"] = "Limited pa ang stock. Tawag una sa center." if False else "Stock is limited. Call the center first."
    elif status == "Available":
        reply["guidance"] = "Naa sa stock base sa latest nga record." if False else "Listed as available in the latest record."
    return reply


@app.get("/api/chat")
def chat(
    message: str = Query(..., min_length=2),
    center: int = Query(1),
    lang: str = Query("en"),
    lat: Optional[float] = Query(None),
    lng: Optional[float] = Query(None),
    x_auth_token: Optional[str] = Header(None),
):
    lang = normalize_lang(detect_lang(message, lang))
    refusal = scope_check(message, lang)
    if refusal and refusal.startswith("__identity__"):
        return {"result": "text", "message": refusal[len("__identity__"):]}
    if refusal:
        return {"result": "text", "message": refusal}

    user_lat = lat if lat is not None else TANDAG_CENTER[0]
    user_lng = lng if lng is not None else TANDAG_CENTER[1]

    key = user_key(x_auth_token)
    ctx = load_context(key)
    d = bank_detect(message, center, ctx) or detect_intent(message, center, ctx)
    intent = d["intent"]
    cid = d["center"]
    item = d["item"]

    reply = _route_chat(intent, cid, item, d.get("clarify_key"), lang, user_lat, user_lng)

    save_context(
        key,
        last_item=item or ctx.get("last_item"),
        last_center=d["center_explicit"] or ctx.get("last_center"),
        last_intent=intent,
        pending=d.get("clarify_key"),
    )
    return reply


@app.get("/api/centers")
def get_centers():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM health_centers ORDER BY name").fetchall()
    conn.close()
    return [dict(r) for r in rows]


# NEW (Phase 1): full profile for one health center
@app.get("/api/centers/{center_id}/profile")
def center_profile(center_id: int):
    conn = get_connection()
    center = conn.execute(
        """
        SELECT id, name, barangay, contact_number, address, latitude, longitude
        FROM health_centers WHERE id = ?
        """,
        (center_id,),
    ).fetchone()
    if center is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Health center not found")

    hours = conn.execute(
        """
        SELECT day_of_week, start_time, end_time, service_name
        FROM clinic_schedule
        WHERE health_center_id = ? AND is_cancelled = 0
        ORDER BY day_of_week, start_time
        """,
        (center_id,),
    ).fetchall()

    services = conn.execute(
        """
        SELECT DISTINCT service_name FROM clinic_schedule
        WHERE health_center_id = ? AND is_cancelled = 0
        """,
        (center_id,),
    ).fetchall()

    items = conn.execute(
        """
        SELECT i.name, i.category, s.status, s.last_confirmed_at
        FROM items i
        LEFT JOIN stock_status s ON s.id = (
            SELECT id FROM stock_status WHERE item_id = i.id
            ORDER BY status_changed_at DESC, id DESC LIMIT 1
        )
        WHERE i.health_center_id = ? AND i.is_active = 1
        ORDER BY i.category, i.name
        """,
        (center_id,),
    ).fetchall()
    conn.close()

    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    schedule = [
        {
            "day": day_names[h["day_of_week"]],
            "start": h["start_time"],
            "end": h["end_time"],
            "service": h["service_name"],
        }
        for h in hours
    ]

    inventory = [
        {
            "name": r["name"],
            "category": r["category"],
            "availability": STATUS_LABELS.get(r["status"], "No Current Record"),
            "last_confirmed_at": to_ph_time(r["last_confirmed_at"]),
        }
        for r in items
    ]

    confirmed_values = [r["last_confirmed_at"] for r in items if r["last_confirmed_at"]]
    last_confirmed = max(confirmed_values) if confirmed_values else None

    return {
        "id": center["id"],
        "name": center["name"],
        "barangay": center["barangay"],
        "address": center["address"],
        "contact": center["contact_number"],
        "lat": center["latitude"],
        "lng": center["longitude"],
        "schedule": schedule,
        "services": [s["service_name"] for s in services],
        "inventory": inventory,
        "last_confirmed": to_ph_time(last_confirmed),
    }


@app.get("/api/medicines")
def list_medicines():
    conn = get_connection()
    rows = conn.execute(
        "SELECT name, category, description, MAX(id) AS id FROM items WHERE is_active = 1 GROUP BY name ORDER BY name"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/items")
def items_for_center(center: int = Query(...)):
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT i.id AS item_id, i.name, i.category, s.status, s.last_confirmed_at, s.updated_by
        FROM items i
        LEFT JOIN stock_status s ON s.id = (
            SELECT id FROM stock_status WHERE item_id = i.id
            ORDER BY status_changed_at DESC, id DESC LIMIT 1
        )
        WHERE i.health_center_id = ? AND i.is_active = 1
        ORDER BY i.name
        """,
        (center,),
    ).fetchall()
    conn.close()

    return [
        {
            "item_id": r["item_id"],
            "name": r["name"],
            "category": r["category"],
            "status_key": r["status"],
            "availability": STATUS_LABELS.get(r["status"], "No Current Record"),
            "last_confirmed_at": to_ph_time(r["last_confirmed_at"]),
            "updated_by": r["updated_by"],
        }
        for r in rows
    ]


@app.post("/api/report")
def submit_report(data: ResidentReport):
    conn = get_connection()
    conn.execute(
        "INSERT INTO resident_reports (health_center_id, report_type, details) VALUES (?, ?, ?)",
        (data.health_center_id, data.report_type, data.details),
    )
    conn.commit()
    conn.close()
    return {"ok": True, "message": "Salamat! Na-record na ang imong report."}


@app.get("/api/staff/reports", dependencies=[Depends(verify_staff_pin)])
def get_reports():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM resident_reports ORDER BY submitted_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


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


@app.post("/api/staff/confirm", dependencies=[Depends(verify_staff_pin)])
def confirm_stock(item_id: int = Query(...), updated_by: str = Query(...)):
    conn = get_connection()
    item = conn.execute(
        "SELECT health_center_id, name FROM items WHERE id = ?", (item_id,)
    ).fetchone()
    if item is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Item not found")

    conn.execute(
        """
        UPDATE stock_status
        SET last_confirmed_at = CURRENT_TIMESTAMP, updated_by = ?
        WHERE id = (
            SELECT id FROM stock_status WHERE item_id = ?
            ORDER BY status_changed_at DESC, id DESC LIMIT 1
        )
        """,
        (updated_by, item_id),
    )
    conn.execute(
        "INSERT INTO update_log (health_center_id, staff_name, action) VALUES (?, ?, ?)",
        (item["health_center_id"], updated_by, f"{item['name']}: confirmed"),
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
            SELECT id FROM stock_status WHERE item_id = i.id
            ORDER BY status_changed_at DESC, id DESC LIMIT 1
        )
        WHERE i.health_center_id = ? AND i.is_active = 1
        """,
        (center,),
    ).fetchall()
    config = _freshness_config(conn)
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


# Tan-aw: full list with status and description (overrides the earlier list reply)
def _items_reply(center_id: int, lang: str) -> dict:
    conn = get_connection()
    rows = conn.execute(
        """SELECT i.name, i.category, i.description, s.status
           FROM items i
           LEFT JOIN stock_status s ON s.id = (
               SELECT id FROM stock_status WHERE item_id = i.id
               ORDER BY status_changed_at DESC, id DESC LIMIT 1)
           WHERE i.health_center_id = ? AND i.is_active = 1
           ORDER BY i.category, i.name""",
        (center_id,),
    ).fetchall()
    conn.close()
    if not rows:
        return {"result": "text", "message": tx(lang, "items_none")}

    def line(r):
        status = STATUS_LABELS.get(r["status"], "No record")
        desc = r["description"] or ""
        return f"{r['name']} - {status}" + (f". {desc}" if desc else "")

    meds = [line(r) for r in rows if r["category"] != "vaccine"]
    vacc = [line(r) for r in rows if r["category"] == "vaccine"]
    if lang == "ceb":
        labels = ("Mga tambal", "Mga bakuna", "Kini ang status sa center:")
    else:
        labels = ("Medicines", "Vaccines", "Here is the status at this center:")
    return {
        "result": "list",
        "intro": labels[2],
        "groups": [
            {"label": labels[0], "items": meds},
            {"label": labels[1], "items": vacc},
        ],
    }