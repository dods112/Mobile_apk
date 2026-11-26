import hashlib
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from database import get_connection

router = APIRouter(prefix="/api/auth", tags=["auth"])

SESSION_HOURS = 12
HASH_ITERATIONS = 200_000
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,30}$")
STAFF_ROLES = ("staff", "admin")


def ensure_auth_tables():
    conn = get_connection()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'resident',
            full_name TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at TEXT NOT NULL
        );
    """)
    cols = [r["name"] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
    if "center_id" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN center_id INTEGER")
    conn.commit()
    conn.close()


def _hash(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), HASH_ITERATIONS
    ).hex()


def _create_session(conn, user_id: int) -> str:
    now = datetime.now(timezone.utc)
    conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now.isoformat(),))
    token = secrets.token_urlsafe(32)
    expires = now + timedelta(hours=SESSION_HOURS)
    conn.execute(
        "INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)",
        (token, user_id, expires.isoformat()),
    )
    return token


def _payload(user, token=None) -> dict:
    data = {
        "username": user["username"],
        "role": user["role"],
        "full_name": user["full_name"],
        "center_id": user["center_id"],
    }
    if token:
        data["token"] = token
    return data


def get_session_user(token):
    if not token:
        return None
    conn = get_connection()
    row = conn.execute(
        """
        SELECT u.username, u.role, u.full_name, u.center_id, s.expires_at
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = ?
        """,
        (token,),
    ).fetchone()
    conn.close()
    if row is None:
        return None
    if datetime.fromisoformat(row["expires_at"]) < datetime.now(timezone.utc):
        return None
    return {
        "username": row["username"],
        "role": row["role"],
        "full_name": row["full_name"],
        "center_id": row["center_id"],
    }


def check_staff_access(token, pin=None) -> dict:
    user = get_session_user(token)
    if user and user["role"] in STAFF_ROLES:
        return user
    expected_pin = os.getenv("STAFF_PIN")
    if expected_pin and pin == expected_pin:
        return {"username": "pin", "role": "staff", "full_name": "Staff", "center_id": None}
    raise HTTPException(status_code=401, detail="Kinahanglan og staff login.")


def require_staff(x_auth_token: str | None = Header(None), x_staff_pin: str | None = Header(None)):
    return check_staff_access(x_auth_token, x_staff_pin)


def seed_admin():
    password = os.getenv("ADMIN_PASSWORD")
    if not password:
        return
    username = os.getenv("ADMIN_USERNAME", "admin")
    conn = get_connection()
    exists = conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone()
    if exists is None:
        salt = secrets.token_hex(16)
        conn.execute(
            "INSERT INTO users (username, password_hash, salt, role, full_name) VALUES (?,?,?,?,?)",
            (username, _hash(password, salt), salt, "admin", "Administrator"),
        )
        conn.commit()
        print(f"[auth] Created admin account '{username}'.")
    conn.close()


class Credentials(BaseModel):
    username: str
    password: str


class RegisterIn(BaseModel):
    username: str
    password: str
    full_name: str | None = None
    invite_code: str | None = None


@router.post("/register")
def register(data: RegisterIn):
    username = data.username.strip()
    if not USERNAME_RE.match(username):
        raise HTTPException(status_code=400, detail="Username: 3 to 30 letters, numbers, dots, dashes, or underscores.")
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password: at least 6 characters.")

    role = "resident"
    invite = os.getenv("STAFF_INVITE_CODE")
    if invite and data.invite_code and secrets.compare_digest(
        data.invite_code.strip().encode(), invite.encode()
    ):
        role = "resident"  # staff accounts are created by an admin

    salt = secrets.token_hex(16)
    full_name = (data.full_name or "").strip() or username

    conn = get_connection()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, salt, role, full_name) VALUES (?,?,?,?,?)",
            (username, _hash(data.password, salt), salt, role, full_name),
        )
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=409, detail="Gigamit na ang username.")

    user_id = cur.lastrowid
    token = _create_session(conn, user_id)
    conn.commit()
    user = conn.execute(
        "SELECT username, role, full_name, center_id FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    conn.close()
    return _payload(user, token)


@router.post("/login")
def login(data: Credentials):
    conn = get_connection()
    user = conn.execute(
        "SELECT id, username, password_hash, salt, role, full_name, center_id FROM users WHERE username = ?",
        (data.username.strip(),),
    ).fetchone()
    if user is None or not secrets.compare_digest(
        user["password_hash"], _hash(data.password, user["salt"])
    ):
        conn.close()
        raise HTTPException(status_code=401, detail="Mali ang username o password.")

    token = _create_session(conn, user["id"])
    conn.commit()
    conn.close()
    return _payload(user, token)


@router.get("/me")
def me(x_auth_token: str | None = Header(None)):
    user = get_session_user(x_auth_token)
    if user is None:
        raise HTTPException(status_code=401, detail="Not signed in")
    return user


@router.post("/logout")
def logout(x_auth_token: str | None = Header(None)):
    if x_auth_token:
        conn = get_connection()
        conn.execute("DELETE FROM sessions WHERE token = ?", (x_auth_token,))
        conn.commit()
        conn.close()
    return {"ok": True}