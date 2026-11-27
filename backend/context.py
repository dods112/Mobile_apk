from datetime import datetime, timezone

from database import get_connection


def ensure_context_table():
    conn = get_connection()
    conn.execute(
        """CREATE TABLE IF NOT EXISTS chat_context (
            user_key TEXT PRIMARY KEY,
            last_item TEXT,
            last_center INTEGER,
            last_intent TEXT,
            pending TEXT,
            updated_at TEXT
        )"""
    )
    conn.commit()
    conn.close()


def user_key(token):
    if not token:
        return "anon"
    conn = get_connection()
    row = conn.execute(
        "SELECT u.id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?",
        (token,),
    ).fetchone()
    conn.close()
    return f"u{row['id']}" if row else "anon"


def load_context(key):
    conn = get_connection()
    row = conn.execute(
        "SELECT last_item, last_center, last_intent, pending FROM chat_context WHERE user_key = ?",
        (key,),
    ).fetchone()
    conn.close()
    if row is None:
        return {}
    return {
        "last_item": row["last_item"],
        "last_center": row["last_center"],
        "last_intent": row["last_intent"],
        "pending": row["pending"],
    }


def save_context(key, last_item=None, last_center=None, last_intent=None, pending=None):
    conn = get_connection()
    conn.execute("DELETE FROM chat_context WHERE user_key = ?", (key,))
    conn.execute(
        """INSERT INTO chat_context
           (user_key, last_item, last_center, last_intent, pending, updated_at)
           VALUES (?,?,?,?,?,?)""",
        (key, last_item, last_center, last_intent, pending,
         datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    conn.close()