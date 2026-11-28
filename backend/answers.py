import re

from database import get_connection

STOP = {
    "unsa", "unsay", "nang", "ang", "sa", "ba", "ko", "mo", "ka", "pa", "na", "ni", "ng",
    "og", "ug", "kay", "ako", "ikaw", "nimo", "imo", "ta", "maka", "man", "the", "is", "are",
    "do", "you", "i", "a", "an", "of", "to", "for", "it", "can", "what", "lang", "karon",
    "ron", "diha", "aha", "ha", "oo", "sige", "okay", "ok", "gusto", "want", "pls", "please",
}
GENERIC = {
    "health", "center", "centers", "clinic", "office", "birthing", "city", "barangay",
    "street", "road", "centro", "sentro", "surigao", "tandag", "del", "sur",
}
LOCATION = {"asa", "saan", "where", "kuha", "makuha", "makakuha", "palit", "bili", "buy",
            "purchase", "makapalit", "makabili"}
FOLLOW = {"mana", "ana", "kana", "kuha", "makuha", "makakuha", "kini", "ato", "ani"}
MED_WORDS = {"tambal", "gamot", "medicine", "medisina", "medication", "drug", "bakuna", "vaccine"}
BLOCKED = {"para", "tt", "iron"}

BANK = {
    "medicine_availability": [
        "is amoxicillin available", "do you have paracetamol", "naa ba ang paracetamol",
        "may stock ba ng biogesic", "unsa nang amox", "available pa ba ang metformin",
        "wala na ba ang bioflu", "is ors in stock",
    ],
    "vaccine_availability": [
        "naa pa bay bakuna", "may bcg vaccine ba", "available ba ang tetanus vaccine",
        "unsa nga bakuna ang available", "is hepatitis b vaccine available",
    ],
    "medicine_search": [
        "what medicines are available", "unsa nga tambal ang available", "list sa tambal",
        "unsay mga tambal naa", "tanan nga tambal available", "show all medicines",
    ],
    "clinic_hours": [
        "open pa ba ang health center", "bukas ba ang clinic karon",
        "unsa ang oras sa health center", "what time do you close", "sirado na ba",
        "unsa ilang oras", "are you open now",
    ],
    "health_services": [
        "what services are available", "unsa ang serbisyo sa health center",
        "naa bay doctor", "available ba ang prenatal", "what services do you offer",
    ],
    "find_health_center": [
        "where is the nearest health center", "asa ang pinakaduol nga health center",
        "nearest center to me", "health center nga duol nako", "which center is near",
    ],
    "find_medicine_location": [
        "asa man ta maka palit og tambal", "where can i get paracetamol",
        "asa ko makakuha og amoxicillin", "saan makakabili ng gamot", "asa naa ang metformin",
    ],
    "greeting": ["hello", "hi", "kumusta", "maayong adlaw", "good morning"],
    "thanks": ["salamat", "thank you", "thanks a lot"],
}


def norm(text):
    t = (text or "").lower().replace("-", " ").replace("'", "")
    t = re.sub(r"[^\w\s]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def words(text):
    return {w for w in norm(text).split() if w not in STOP and len(w) >= 2}


def score(msg_words, example):
    ew = words(example)
    if not ew or not msg_words:
        return 0.0
    return len(msg_words & ew) / len(ew)


def generated_examples():
    # Every medicine in the database gets its own questions, so no name is hand-written
    conn = get_connection()
    rows = conn.execute("SELECT DISTINCT name FROM items WHERE is_active = 1").fetchall()
    conn.close()
    out = {"medicine_availability": [], "vaccine_availability": [], "medicine_search": []}
    for r in rows:
        n = r["name"]
        out["medicine_availability"] += [
            f"is {n} available", f"unsa nang {n}", f"naa ba ang {n}",
            f"asa naa ang {n}", f"do you have {n}",
        ]
    return out


def _all_bank():
    merged = {k: list(v) for k, v in BANK.items()}
    for k, v in generated_examples().items():
        merged[k] = merged.get(k, []) + v
    return merged


def _items():
    conn = get_connection()
    rows = conn.execute(
        """SELECT i.name, i.category, a.alias
           FROM items i LEFT JOIN item_aliases a ON a.item_id = i.id
           WHERE i.is_active = 1"""
    ).fetchall()
    conn.close()
    out = []
    for r in rows:
        for label in (r["name"], r["alias"]):
            if not label:
                continue
            key = norm(label)
            if len(key) < 3 or key in BLOCKED:
                continue
            out.append((key, r["name"], r["category"] or "medicine"))
    out.sort(key=lambda x: len(x[0]), reverse=True)
    return out


def _find_item(clean, items):
    padded = " " + clean + " "
    for key, name, cat in items:
        if " " + key + " " in padded:
            return name, cat
    return None, None


def _find_center(clean):
    conn = get_connection()
    rows = conn.execute("SELECT id, name, address FROM health_centers").fetchall()
    conn.close()
    owners = {}
    for r in rows:
        for w in set(norm(f"{r['name']} {r['address'] or ''}").split()):
            if len(w) >= 5 and w not in GENERIC:
                owners.setdefault(w, set()).add(r["id"])
    for w in set(clean.split()):
        ids = owners.get(w)
        if ids and len(ids) == 1:
            return next(iter(ids))
    return None


INFO_RE = re.compile(r"\b(for|gamit|gamiton|ginagamit|para|used for|what is|what does|unsa ang|unsay|ano ang|kung unsa|does)\b")
STOCK_RE = re.compile(r"\b(available|avail|stock|naa|wala|nahutdan|bukas|pila|mana|makuha|kuha|palit|bili)\b")


def _is_info(clean):
    return bool(INFO_RE.search(clean)) and not STOCK_RE.search(clean)

def _detect(text, center_id, ctx):
    if ctx.get("pending"):
        return None
    clean = norm(text)
    w = words(clean)
    raw = set(clean.split())
    if not w:
        return None

    items = _items()
    item, category = _find_item(clean, items)
    explicit = _find_center(clean)

    bank = _all_bank()
    best, best_intent = 0.0, None
    for intent, examples in bank.items():
        for ex in examples:
            s = score(w, ex)
            if s > best:
                best, best_intent = s, intent

    location = bool(raw & LOCATION)
    follow = bool(raw & FOLLOW)

    if item is None and ctx.get("last_item") and follow:
        item = ctx["last_item"]
        _, category = _find_item(norm(item), items)

    if item and _is_info(clean):
        return {"intent": "medicine_info", "item": item, "center": explicit or center_id,
                "center_explicit": explicit, "clarify_key": None, "category": category}
    clarify = None
    if item:
        if best >= 0.5 and best_intent in ("medicine_availability", "find_medicine_location"):
            intent = best_intent
        else:
            intent = "find_medicine_location" if location else "medicine_availability"
        if intent == "medicine_availability" and category == "vaccine":
            intent = "vaccine_availability"
    elif best >= 0.5:
        intent = best_intent
        if intent in ("medicine_availability", "vaccine_availability"):
            if best >= 0.9:
                intent = "medicine_search"
            else:
                intent = "clarification"
                clarify = "medicine_choice"
    elif location:
        intent = "find_medicine_location"
        clarify = "purchase_or_center"
    elif raw & MED_WORDS:
        intent = "clarification"
        clarify = "medicine_choice"
    else:
        return None

    center = explicit
    if center is None and intent in ("clinic_hours", "health_services"):
        center = ctx.get("last_center")
    if center is None:
        center = center_id

    return {
        "intent": intent,
        "item": item,
        "center": center,
        "center_explicit": explicit,
        "clarify_key": clarify,
        "category": category,
    }


def bank_detect(text, center_id=1, ctx=None):
    try:
        return _detect(text, center_id, ctx or {})
    except Exception:
        return None