import re

from database import get_connection

ON_TOPIC = re.compile(
    r"\b(tambal|gamot|medicine|medicines|medisina|vaccine|vaccines|bakuna|stock|available|avail|naa|wala|"
    r"health center|center|centro|sentro|clinic|oras|hours|open|bukas|sarado|sirado|serbisyo|services|"
    r"referral|kuha|palit|asa|saan|where|nearest|pinakaduol|duol|distance|layo|direction|tawag|call|"
    r"unsa|unsay|nang|ang|sa|ors|mana|pila|ilang|makuha|kaila|amox|tanan|list|lista)\b",
    re.IGNORECASE,
)
MEDICAL = re.compile(
    r"\b(dosage|dose|ilang mg|pila ka mg|how many tablet|diagnos\w*|unsa ang sakit|what disease|"
    r"prescri\w*|reseta|buntis|pregnant|makadaot|side effect|allergy|allergic)\b",
    re.IGNORECASE,
)
IDENTITY = re.compile(
    r"\b(unsa ka|unsa man ka|what is this|what are you|who are you|who made|kinsa ang naghimo|"
    r"what can you do|unsa ang mahimo|how do you work|ikaw ba)\b",
    re.IGNORECASE,
)
IDENTITY_REPLY = {
    "en": "I am Tan-aw AI, a health-center information assistant for Tandag City. I can tell you if a medicine or vaccine is available at a health center, when a center is open, its services, and nearby referrals. Ask me something like \"is amoxicillin available?\"",
    "ceb": "Ako si Tan-aw AI, usa ka assistant nga nagtambag bahin sa health center sa Tandag City. Mahimo ko nga isulti kung naa ang tambal o bakuna sa center, kung bukas ang center, serbisyo niini, ug referral sa duol nga center. Pangutana ko, pananglitan: \"naa ba ang amoxicillin?\"",
}
REFUSE_OFFTOPIC = {
    "en": "I can only help with medicine and vaccine availability, health center hours, services, and referrals in Tandag City. Do you want to check one of those?",
    "ceb": "Mahimo ko nga motabang lang sa availability sa tambal ug bakuna, oras sa health center, serbisyo, ug referral sa Tandag City. Gusto ba nimo tan-awon ang usa niini?",
}
REFUSE_MEDICAL = {
    "en": "I cannot advise on dosage, diagnosis, or whether a medicine suits you. Please ask a doctor or pharmacist. I can tell you if a medicine is listed as available at a health center.",
    "ceb": "Dili ko makatambag bahin sa dosage, diagnosis, o kung angay ba kanimo ang tambal. Palihug pangutana sa doktor o pharmacist. Mahimo ko nga itug-an kung naa sa health center ang tambal.",
}


def _item_words():
    # Every medicine name and alias in the database counts as on-topic
    conn = get_connection()
    rows = conn.execute(
        "SELECT i.name, a.alias FROM items i LEFT JOIN item_aliases a ON a.item_id = i.id WHERE i.is_active = 1"
    ).fetchall()
    conn.close()
    words = set()
    for r in rows:
        for label in (r["name"], r["alias"]):
            if label:
                words.update(re.findall(r"[a-z0-9]+", label.lower()))
    return {w for w in words if len(w) >= 3}


def check(message, lang="en"):
    """Returns None to let the message through, a refusal, or an identity reply prefixed with __identity__."""
    text = (message or "").strip()
    ceb = lang == "ceb"
    if IDENTITY.search(text):
        return "__identity__" + IDENTITY_REPLY["ceb" if ceb else "en"]
    if MEDICAL.search(text):
        return REFUSE_MEDICAL["ceb" if ceb else "en"]
    if ON_TOPIC.search(text):
        return None
    lowered = set(re.findall(r"[a-z0-9]+", text.lower()))
    if lowered & _item_words():
        return None
    return REFUSE_OFFTOPIC["ceb" if ceb else "en"]