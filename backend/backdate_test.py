from database import get_connection

conn = get_connection()
conn.execute(
    """
    UPDATE stock_status
    SET last_confirmed_at = datetime('now', '-3 days')
    WHERE item_id = 3
    """
)
conn.commit()
conn.close()
print("ORS backdated 3 days")