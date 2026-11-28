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
    q = f"is {name} available"
    b = bank_detect(q, 1, {})
    r = client.get("/api/chat", params={"message": q, "center": 1, "lang": "en"})
    body = r.json() if r.status_code == 200 else {}
    has_desc = bool(body.get("description"))
    ok = r.status_code == 200 and body.get("item") == name and has_desc
    fails += (not ok)
    print(("PASS" if ok else "FAIL"), f"{name:28}", "bank:", (b or {}).get("intent"),
          "| http:", r.status_code, "| description:", "yes" if has_desc else "no")

print(f"\n{len(names) - fails} of {len(names)} medicines answered with a description")