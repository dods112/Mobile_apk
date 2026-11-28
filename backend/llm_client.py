import os
import json
import urllib.request

API_KEY = os.getenv("LLM_API_KEY", "").strip()
MODEL = os.getenv("LLM_MODEL", "gemini-2.0-flash")
URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"

SYSTEM = (
    "You are Capsule AI, the health-center information assistant for Tandag City, Surigao del Sur. "
    "Answer only about medicine and vaccine availability, health center hours, services, and referrals. "
    "Use ONLY the facts in the DATA block. Never invent stock, hours, prices, phone numbers, or centers. "
    "If the DATA does not answer the question, say you have no reliable record and tell the resident to call their health center. "
    "Never give dosage, diagnosis, or medical advice. Reply in the same language the resident uses "
    "(English, Filipino, or Bisaya), in two or three short sentences."
)


def available():
    return bool(API_KEY)


def answer(question, data, lang="en"):
    """Returns the model's reply text, or None if the model could not be used."""
    if not API_KEY:
        return None
    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM}]},
        "contents": [{
            "role": "user",
            "parts": [{"text": f"Resident language: {lang}\nQuestion: {question}\nDATA: {json.dumps(data, ensure_ascii=False)}"}],
        }],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 220},
    }
    req = urllib.request.Request(
        URL.format(model=MODEL, key=API_KEY),
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        return body["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception:
        return None