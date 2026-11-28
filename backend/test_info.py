from fastapi.testclient import TestClient
from main import app
from database import get_connection
from answers import bank_detect

client = TestClient(app)
conn = get_connection()
names = [r["name"] for r in conn.execute(
    "SELECT DISTINCT name FROM items WHERE is_active = 1 ORDER BY name").fetchall()]
conn.close()

fails = 0
for name in names:
    for q, lang in ((f"what is {name} for?", "en"), (f"unsa ang gamit sa {name}", "ceb")):
        d = bank_detect(q, 1, {})
        r = client.get("/api/chat", params={"message": q, "center": 1, "lang": lang})
        body = r.json() if r.status_code == 200 else {}
        ok = ((d or {}).get("intent") == "medicine_info"
              and body.get("result") == "info"
              and bool(body.get("description"))
              and "availability" not in body)
        fails += (not ok)
        print("PASS" if ok else "FAIL", f"{name:24}", f"{q!r:36}", "| description:", "yes" if body.get("description") else "no")

print(f"\n{len(names)*2 - fails} of {len(names)*2} info questions answered correctly")