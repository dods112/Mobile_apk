from database import get_connection

conn = get_connection()
rows = conn.execute(
    "SELECT username, role, full_name, created_at FROM users ORDER BY id"
).fetchall()
conn.close()

if not rows:
    print("No accounts yet. Set ADMIN_PASSWORD and restart the backend.")
else:
    print(f"{'USERNAME':<20}{'ROLE':<12}{'FULL NAME':<24}CREATED")
    print("-" * 70)
    for r in rows:
        print(f"{r['username']:<20}{r['role']:<12}{(r['full_name'] or ''):<24}{r['created_at']}")