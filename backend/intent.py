import re
from rapidfuzz import process, fuzz
from database import get_connection

# ==========================================
# 1. HEALTH CENTER OPERATING HOURS
# ==========================================
OPEN_KEYWORDS = [
    "open", "opened", "opening", "close", "closed", "closing",
    "operating hours", "clinic hours", "office hours", "business hours",
    "schedule", "what time", "until what time", "available today",
    "are you open", "is the center open", "open today", "closed today",
    "open now", "closed now", "what time do you open", "what time do you close",
    "opening time", "closing time", "hours of operation", "are you operating",
    "bukas", "sarado", "anong oras", "anong oras bukas", "anong oras magbubukas",
    "hanggang anong oras", "oras ng operasyon", "oras ng pagbubukas",
    "oras ng pagsasara", "operating schedule", "may pasok ba",
    "bukas ba kayo", "sarado na ba", "bukas ba ngayon", "anong araw bukas",
    "anong araw sarado", "may tao ba ngayon", "hanggang kailan bukas",
    "anong oras kayo", "bukas ba ang health center", "sarado ba ang health center",
    "abri", "abli", "sirado", "sira", "unsang orasa", "unsa orasa", "unsa oras",
    "pila ka oras", "hangtod kanus-a", "hangtod unsang orasa", "abli ba",
    "abri ba", "sirado ba", "naa bay duty", "naa bay staff", "operating ba",
    "open ba karon", "hangtod alas", "unsay oras sa health center", "unsa oras mo abli",
    "unsa oras mo sira", "unsa oras mag-abli", "unsa oras mangsirado",
    "abli pa ba", "nag-operate ba mo", "naka-abli ba mo karon", "dili ba sirado karon",
    "naa mo ron", "naa ba mo karon", "abli na mo", "unsa oras mahuman",
    "unsay schedule ninyo", "naa moy duty karon", "unsa ka oras", "abli ba mo ugma"
]

# ==========================================
# 2. HEALTH CENTER SERVICES
# ==========================================
SERVICES_KEYWORDS = [
    "service", "services", "medical services", "health services", "consultation",
    "checkup", "medical checkup", "doctor", "doctors", "physician", "nurse",
    "midwife", "prenatal", "family planning", "vaccination", "immunization",
    "wound care", "first aid", "maternal care", "child care", "health program",
    "available services", "what services", "medical assistance", "dental",
    "laboratory", "blood test", "medicine consultation", "prenatal checkup",
    "pregnancy checkup", "baby checkup", "immunization schedule", "vaccine schedule",
    "serbisyo", "serbisyong medikal", "konsulta", "pagpapakonsulta", "patingin",
    "check up", "pagpapacheckup", "doktor", "nars", "hilot", "bakunahan",
    "libreng konsultasyon", "serbisyo ng health center", "anong serbisyo",
    "ano ang serbisyo", "paano magpatingin", "magpapatingin", "magpapakonsulta",
    "may doktor ba", "may nars ba", "may midwife ba", "magpapabakuna",
    "saan pwede magpatingin", "gusto ko magpacheckup", "prenatal checkup",
    "family planning", "pagpapabakuna", "serbisyong pangkalusugan",
    "unsa inyong serbisyo", "unsay serbisyo",
    "unsa nga serbisyo", "naa moy checkup", "naa moy doktor", "naa moy nurse",
    "naa moy midwife", "magpakonsulta", "magpa checkup", "magpa konsulta",
    "magpatan-aw", "magpa tambal", "pa checkup",
    "pagpabakuna", "unsay pwede makuha", "unsa ang inyong serbisyo",
    "magpatambal", "magpatinggal", "unsay ma-offer ninyo", "unsa mga serbisyo naa ninyo",
    "naa bay doctor karon", "naa bay nars", "gusto ko magpacheckup",
    "asa mi magpacheckup", "unsa inyong programa", "naa bay prenatal",
    "naa bay family planning", "naa bay bakunahan", "naa moy dental", "naa moy laboratory"
]

# ==========================================
# 3. MEDICINE AVAILABILITY
# ==========================================
MEDICINE_WORDS = [
    "tambal", "medicine", "medicines", "medication", "medications", "drug", "drugs",
    "available", "availability", "avail", "in stock", "out of stock", "stock",
    "stocks", "inventory", "medicine supply", "medical supplies", "medicine list",
    "available medicines", "medicine inventory", "any medicine", "any vaccines",
    "have medicine", "medicine available", "medicine stock",
    "gamot", "mga gamot", "medisina", "may gamot", "meron bang gamot",
    "may available", "may stock", "mayroon pa ba", "anong gamot",
    "anong mga gamot", "gamot ninyo", "libreng gamot", "libreng medisina",
    "may bakuna", "may available na bakuna", "may paracetamol ba", 
    "may amoxicillin ba", "may antibiotics ba", "wala bang gamot",
    "naa moy tambal", "naa bay tambal", "naa pa bay tambal", "naa pa moy tambal",
    "naa moy medisina", "naa moy stock", "naay tambal", "naay medisina",
    "naa pa", "wala na", "nahutdan", "unsay tambal", "unsa nga tambal",
    "tambal ninyo", "tambal sa health center", "pila pa ka tambal", "pila kabuok",
    "naa moy bakuna", "naa bay bakuna", "bakuna", "vaccine", "vaccines",
    "vaccination", "immunization", "naa mo paracetamol", "naa mo amoxicillin",
    "unsa na tambal naa ninyo", "unsa na bakuna naa ninyo", "unsay available na tambal",
    "unsa mga tambal naa", "naa bay fever medicine", "naa bay pain reliever",
    "naa moy antibiotics", "naa moy biogesic", "naa moy paracetamol",
    "naa moy neozep", "naa moy bioflu", "unsa tambal sa hilanat",
    "unsa tambal sa ubo", "unsa tambal sa sip-on", "unsay tambal sa sakit ng tiyan",
    "paracetamol", "amoxicillin", "ibuprofen", "cetirizine", "loratadine", "lagundi",
    "carbocisteine", "salbutamol", "metformin", "losartan", "omeprazole",
    "ferrous sulfate", "vitamin c", "multivitamins", "oral rehydration salts",
    "ors", "biogesic", "neozep", "bioflu", "alaxan", "medicol", "tempra",
    "mefenamic", "diatabs", "kremil s", "solmux", "tuseran", "ventolin",
    "ascorbic acid", "ferrous", "amlodipine", "metoprolol"
]


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

    clean_text = normalize(text)
    words = clean_text.split()
    
    candidates = []
    name_map = {} 
    
    for row in rows:
        full_name = row["name"]
        candidates.append(normalize(full_name))
        name_map[normalize(full_name)] = full_name
        
        if row["alias"]:
            alias_clean = normalize(row["alias"])
            candidates.append(alias_clean)
            name_map[alias_clean] = full_name

    # 1. Exact match
    for word in words:
        if word in candidates:
            return name_map[word]

    # 2. Fuzzy match (handles typos like "parasetamol")
    for word in words:
        if len(word) < 3:
            continue
        match, score, _ = process.extractOne(word, candidates, scorer=fuzz.ratio)
        if score >= 80:
            return name_map[match]

    return None


def detect_intent(text: str, center_id: int = 1) -> dict:
    clean = normalize(text)
    words = set(clean.split())

    # 1. Check for specific medicine first (e.g., "Meron bang paracetamol?")
    item = find_item(clean, center_id)
    if item:
        return {"intent": "stock", "item": item, "center": center_id}

    # 2. Check for Open/Closed intent
    # Using substring search instead of exact word match to catch phrases like "unsa oras"
    if any(k in clean for k in OPEN_KEYWORDS):
        return {"intent": "open_now", "center": center_id}

    # 3. Check for Services intent
    if any(k in clean for k in SERVICES_KEYWORDS):
        return {"intent": "services", "center": center_id}

    # 4. Check for general medicine queries (e.g., "Unsay tambal ninyo?")
    if any(k in clean for k in MEDICINE_WORDS):
        return {"intent": "list_items", "center": center_id}

    return {"intent": "unknown"}