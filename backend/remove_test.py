from database import get_connection

conn = get_connection()
deleted = conn.execute(
    "DELETE FROM clinic_schedule WHERE service_name = ?", ("Test Service",)
).rowcount
conn.commit()
conn.close()
print(f"Removed {deleted} test row(s)")