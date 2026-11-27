import re

from rapidfuzz import process, fuzz

from database import get_connection

# Short words that appear in normal Filipino and Bisaya sentences, so they never count as medicine names
BLOCKED_ALIASES = {"para", "tt", "iron"}
GENERIC_CENTER_WORDS = {
    "health", "center", "centers", "clinic", "office", "birthing", "city",
    "barangay", "street", "road", "centro",
}

CLARIFY = {
    "medicine_choice": {
        "en": "Are you looking for a specific medicine, or do you want to see the medicines listed as available here?",
        "ceb": "Gusto ba nimo ang espesipikong tambal, o ang lista sa tambal nga available dinhi?",
    },
    "purchase_or_center": {
        "en": "Do you want to buy medicine at a pharmacy, or check availability at a public health center?",
        "ceb": "Gusto ba nimo mopalit og tambal sa pharmacy, o tan-awon ang availability sa health center?",
    },
}

# Each pattern adds its weight once when it matches the whole message
PATTERNS = {
    "greeting": [
        (r"\b(hello|hi|hey|kumusta|musta|kamusta|maayong|good morning|good afternoon|good day)\b", 3),
    ],
    "thanks": [
        (r"\b(salamat|thank|thanks|lamat)\b", 3),
    ],
    "medical_advice": [
        (r"\b(dosage|dose|ilang mg|pila ka mg|ilang tablet|pila ka tablet|how many|reseta|prescription|prescribe|diagnos\w*|unsa ang sakit|ano ang sakit|what disease|makadaot|buntis|pregnant)\b", 4),
    ],
    "medicine_price": [
        (r"\b(presyo|price|magkano|how much|bayad|cost)\b", 3),
    ],
    "free_medicine_inquiry": [
        (r"\b(libre|libreng|free|walay bayad|no charge)\b", 3),
    ],
    "clinic_hours": [
        (r"\b(open|opened|opening|close|closed|closing|bukas|sarado|sirado|abli|abri|oras|hours|schedule|what time|anong oras|unsa oras|unsay oras|hangtod|hanggang|operating|duty)\b", 3),
    ],
    "health_services": [
        (r"\b(service|services|serbisyo|serbisyong|checkup|check up|konsulta|consultation|doctor|doktor|nurse|nars|midwife|prenatal|dental|laboratory|family planning|magpatingin|magpacheckup|magpakonsulta|programa|program)\b", 3),
    ],
    "find_health_center": [
        (r"\b(health center|center|centro|sentro)\b", 2),
        (r"\b(nearest|nearby|pinakaduol|duol|near me|asa ang health center|asa ang center|asa naa nga center|find health center|find center|which health center|where is the health center|asa dapit)\b", 4),
    ],
    "alternative_health_center": [
        (r"\b(alternative|alternatibo|alternate|other center|another center|other health center|lain nga center|ibang center|ubang center)\b", 4),
    ],
    "find_medicine_location": [
        (r"\b(asa|saan|where)\b.*\b(palit|bili|buy|purchase|kuha|makuha|makakuha|makapalit|get|pick)\b", 5),
        (r"\b(makapalit|palit|bumili|buy|purchase)\b.*\b(tambal|gamot|medicine|medisina)\b", 4),
        (r"\b(asa|saan|where)\b", 3),
    ],
    "medicine_search": [
        (r"\b(list|lista|unsa nga tambal|unsa tambal|unsay tambal|mga tambal|unsa ang tambal|unsa nga bakuna|unsa mga|what medicines|which medicines|medicines available|available medicines|tambal naa|gamot naa|vaccines|bakuna)\b", 4),
    ],
    "medicine_availability": [
        (r"\b(naa|naay|may|meron|available|avail|availability|stock|in stock|out of stock|nahutdan|wala|pa ba|mayroon)\b", 2),
    ],
    "center_availability": [
        (r"\b(sa provincial|sa tandag|dinhi sa|naa sa center|naa dinhi|what about|unsa man)\b", 3),
    ],
}

FOLLOW_RE = r"\b(mana|ana|kana|kuha|makuha|asa|where|kini|ato|ani|naa ba|pa ba|unsa pa|aha|man)\b"
WHERE_RE = r"\b(asa|saan|where|kuha|makuha|makakuha)\b"
LOCATION_RE = r"\b(asa|saan|where)\b"
MED_RE = r"\b(tambal|gamot|medicine|medicines|medisina|medication|drug)\b"


def normalize(text):
    text = (text or "").lower().strip()
    text = text.replace("'", "").replace("-", " ")
    text = re.sub(r"[^\w\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _score(clean):
    scores = {}
    for intent, rules in PATTERNS.items():
        total = sum(weight for pattern, weight in rules if re.search(pattern, clean))
        if total:
            scores[intent] = total
    return scores


def _item_index():
    conn = get_connection()
    rows = conn.execute(
        """SELECT i.name, i.category, a.alias
           FROM items i LEFT JOIN item_aliases a ON a.item_id = i.id
           WHERE i.is_active = 1"""
    ).fetchall()
    conn.close()
    index = {}
    for r in rows:
        for label in (r["name"], r["alias"]):
            if not label:
                continue
            key = normalize(label)
            if len(key) < 3 or key in BLOCKED_ALIASES:
                continue
            index.setdefault(key, (r["name"], r["category"] or "medicine"))
    return index


def find_item_any(clean, index=None):
    index = index if index is not None else _item_index()

    # Exact whole-word match first, longest names first
    padded = " " + clean + " "
    for key in sorted(index, key=len, reverse=True):
        if " " + key + " " in padded:
            return index[key]

    # Fuzzy match on 1 to 3 word phrases, for misspellings
    words = clean.split()
    for n in (3, 2, 1):
        best = None
        for i in range(len(words) - n + 1):
            gram = " ".join(words[i:i + n])
            if len(gram) < 5:
                continue
            hit = process.extractOne(gram, list(index.keys()), scorer=fuzz.ratio)
            if hit and hit[1] >= 84 and (best is None or hit[1] > best[0]):
                best = (hit[1], index[hit[0]])
        if best:
            return best[1]
    return None


def find_item(text, center_id=None):
    found = find_item_any(normalize(text))
    return found[0] if found else None


def _center_index():
    conn = get_connection()
    rows = conn.execute("SELECT id, name, address FROM health_centers ORDER BY id").fetchall()
    conn.close()
    owners = {}
    for r in rows:
        for w in set(normalize(f"{r['name']} {r['address'] or ''}").split()):
            if len(w) >= 5 and w not in GENERIC_CENTER_WORDS:
                owners.setdefault(w, set()).add(r["id"])
    # Only words that belong to exactly one center can identify it
    tokens = {w: next(iter(ids)) for w, ids in owners.items() if len(ids) == 1}
    return tokens, rows


def find_center_ref(clean):
    tokens, rows = _center_index()
    for w in clean.split():
        if w in tokens:
            return tokens[w]
    if re.search(r"\bmain\b", clean) and rows:
        return rows[0]["id"]
    return None


def _resolve_pending(pending, clean, ctx):
    last = ctx.get("last_item")
    base = {"item": last, "center": 1, "center_explicit": None, "clarify_key": None, "category": None}
    if pending == "purchase_or_center":
        if re.search(r"\b(pharmacy|botika|palit|bili|buy|purchase)\b", clean):
            return dict(base, intent="purchase_info", item=None)
        if re.search(r"\b(health|center|centro|sentro|availability|check|tan|awon|naa)\b", clean):
            return dict(base, intent="find_medicine_location" if last else "find_health_center")
    if pending == "medicine_choice":
        if re.search(r"\b(list|lista|available|tanan|all|mga)\b", clean):
            return dict(base, intent="medicine_search", item=None)
    return None


def detect_intent(text, center_id=1, ctx=None):
    ctx = ctx or {}
    clean = normalize(text)
    pending = ctx.get("pending")
    if pending:
        resolved = _resolve_pending(pending, clean, ctx)
        if resolved:
            return resolved
    scores = _score(clean)
    index = _item_index()
    found = find_item_any(clean, index)
    item = found[0] if found else None
    category = found[1] if found else None
    from_msg = found is not None
    explicit = find_center_ref(clean)
    last_item = ctx.get("last_item")
    follow = bool(re.search(FOLLOW_RE, clean)) and len(clean.split()) <= 8
    top = max(scores.values(), default=0)
    clarify = None

    # Follow-ups: fall back to the remembered medicine
    if item is None and last_item:
        if explicit and top < 4:
            item = last_item
            scores["medicine_availability"] = scores.get("medicine_availability", 0) + 4
        elif follow and top < 3:
            item = last_item
            if re.search(WHERE_RE, clean):
                scores["find_medicine_location"] = 10
            else:
                scores["medicine_availability"] = scores.get("medicine_availability", 0) + 10

    # A medicine named in the message favors a stock question unless another topic is clearly stated
    strong = any(v >= 3 for k, v in scores.items() if k != "medicine_availability")
    if from_msg and not strong:
        scores["medicine_availability"] = scores.get("medicine_availability", 0) + 4

    if not scores:
        intent = "unknown"
    else:
        order = list(PATTERNS)
        intent = max(scores, key=lambda k: (scores[k], -order.index(k)))

    # A named medicine with "asa" or "where" means: where can I get it
    if item and re.search(LOCATION_RE, clean) and intent in ("medicine_availability", "find_medicine_location"):
        intent = "find_medicine_location"

    if intent == "medicine_availability" and item is None and not explicit and re.search(MED_RE, clean):
        intent = "clarification"
        clarify = "medicine_choice"

    if intent == "find_medicine_location" and item is None:
        clarify = "purchase_or_center"

    if intent == "medicine_availability" and category == "vaccine":
        intent = "vaccine_availability"

    if explicit:
        center = explicit
    elif intent == "clinic_hours" and ctx.get("last_center"):
        center = ctx["last_center"]
    else:
        center = center_id

    return {
        "intent": intent,
        "item": item,
        "center": center,
        "center_explicit": explicit,
        "clarify_key": clarify,
        "category": category,
    }