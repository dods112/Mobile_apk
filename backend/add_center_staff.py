import hashlib
import secrets

from database import get_connection

HASH_ITERATIONS = 200_000  # must match auth.py

OLD_DEMO_USERNAMES = ["staff1", "staff2", "staff3", "demo_staff"]

# One staff account per center. Centers are matched by name.
CENTER_STAFF = [
    {
        "center_name": "Tandag City Health Office and Birthing Clinic",
        "username": "tandag_staff",
        "full_name": "Tandag Health Office Staff",
    },
    {
        "center_name": "Provincial Health and Wellness Center",
        "username": "provincial_staff",
        "full_name": "Provincial Health Center Staff",
    },
]


def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), HASH_ITERATIONS
    ).hex()


def make_password() -> str:
    # Leaves out easily confused characters like 0/O and 1/l
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
    return "".join(secrets.choice(alphabet) for _ in range(10))


conn = get_connection()

# 1. Make sure users can store a center
cols = [r["name"] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
if "center_id" not in cols:
    conn.execute("ALTER TABLE users ADD COLUMN center_id INTEGER")
    print("Added center_id to users.")

# 2. Remove the old demo staff accounts and their sessions
for username in OLD_DEMO_USERNAMES:
    row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if row:
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
        conn.execute("DELETE FROM users WHERE id = ?", (row["id"],))
        print(f"removed: {username}")

# 3. Create (or reset) one staff account per center
print()
print(f"{'CENTER':<52}{'USERNAME':<18}PASSWORD")
print("-" * 92)
for entry in CENTER_STAFF:
    center = conn.execute(
        "SELECT id FROM health_centers WHERE name = ?", (entry["center_name"],)
    ).fetchone()
    if center is None:
        print(f"[skipped] center not in database yet: {entry['center_name']}")
        continue

    password = make_password()
    salt = secrets.token_hex(16)
    existing = conn.execute(
        "SELECT id FROM users WHERE username = ?", (entry["username"],)
    ).fetchone()

    if existing:
        conn.execute(
            """UPDATE users SET password_hash=?, salt=?, role='staff',
               full_name=?, center_id=? WHERE id=?""",
            (hash_password(password, salt), salt, entry["full_name"], center["id"], existing["id"]),
        )
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (existing["id"],))
    else:
        conn.execute(
            """INSERT INTO users (username, password_hash, salt, role, full_name, center_id)
               VALUES (?,?,?,?,?,?)""",
            (entry["username"], hash_password(password, salt), salt, "staff",
             entry["full_name"], center["id"]),
        )

    print(f"{entry['center_name']:<52}{entry['username']:<18}{password}")

conn.commit()
conn.close()

print()
print("Write these passwords down now. They cannot be shown again.")