import hashlib
import secrets
import sqlite3

from database import get_connection

DEMO_PASSWORD = "DemoStaff2026"  # change this before running
HASH_ITERATIONS = 200_000  # must match auth.py

ACCOUNTS = [
    ("staff1", "Staff One"),
    ("staff2", "Staff Two"),
    ("staff3", "Staff Three"),
    ("demo_staff", "Demo Staff"),
]


def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), HASH_ITERATIONS
    ).hex()


conn = get_connection()
conn.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'resident',
        full_name TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
""")

created = []
for username, full_name in ACCOUNTS:
    salt = secrets.token_hex(16)
    try:
        conn.execute(
            "INSERT INTO users (username, password_hash, salt, role, full_name) VALUES (?,?,?,?,?)",
            (username, hash_password(DEMO_PASSWORD, salt), salt, "staff", full_name),
        )
        created.append(username)
        print(f"created: {username}")
    except sqlite3.IntegrityError:
        print(f"skipped (already exists): {username}")

conn.commit()
conn.close()

print(f"Done. {len(created)} new account(s). Demo password: {DEMO_PASSWORD}")