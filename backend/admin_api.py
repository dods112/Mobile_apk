import re
import secrets
import sqlite3
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from auth import _hash, get_session_user
from database import get_connection

router = APIRouter(prefix="/api/admin", tags=["admin"])

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,30}$")


def require_admin(token):
    user = get_session_user(token)
    if user is None:
        raise HTTPException(status_code=401, detail="Not signed in")
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only.")
    return user


def assert_item_access(item_id, user):
    # Admins can change any item. Staff can change only items at their own center.
    if user is None:
        raise HTTPException(status_code=401, detail="Not signed in")
    if user.get("role") == "admin":
        return
    conn = get_connection()
    row = conn.execute("SELECT health_center_id FROM items WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="Item not found")
    if user.get("center_id") is None or row["health_center_id"] != user["center_id"]:
        raise HTTPException(
            status_code=403,
            detail="You can only change items at your own health center.",
        )


def _center_exists(conn, center_id):
    return conn.execute("SELECT 1 FROM health_centers WHERE id = ?", (center_id,)).fetchone() is not None


def _get_staff(conn, user_id):
    row = conn.execute("SELECT id, role FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Account not found")
    if row["role"] != "staff":
        conn.close()
        raise HTTPException(status_code=400, detail="Only staff accounts can be changed here.")


class StaffIn(BaseModel):
    username: str
    password: str
    full_name: str | None = None
    center_id: int


class PasswordIn(BaseModel):
    password: str


class CenterIn(BaseModel):
    center_id: int


@router.get("/centers")
def admin_centers(x_auth_token: str | None = Header(None)):
    require_admin(x_auth_token)
    conn = get_connection()
    rows = conn.execute("SELECT id, name FROM health_centers ORDER BY name").fetchall()
    conn.close()
    return [{"id": r["id"], "name": r["name"]} for r in rows]


@router.get("/staff")
def admin_staff(x_auth_token: str | None = Header(None)):
    require_admin(x_auth_token)
    conn = get_connection()
    rows = conn.execute(
        """SELECT u.id, u.username, u.full_name, u.center_id, c.name AS center_name
           FROM users u LEFT JOIN health_centers c ON c.id = u.center_id
           WHERE u.role = 'staff'
           ORDER BY u.username"""
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("/staff")
def create_staff(data: StaffIn, x_auth_token: str | None = Header(None)):
    require_admin(x_auth_token)
    username = data.username.strip()
    if not USERNAME_RE.match(username):
        raise HTTPException(status_code=400, detail="Username: 3 to 30 letters, numbers, dots, dashes, or underscores.")
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password: at least 6 characters.")

    conn = get_connection()
    if not _center_exists(conn, data.center_id):
        conn.close()
        raise HTTPException(status_code=400, detail="Choose a valid health center.")

    salt = secrets.token_hex(16)
    full_name = (data.full_name or "").strip() or username
    try:
        cur = conn.execute(
            """INSERT INTO users (username, password_hash, salt, role, full_name, center_id)
               VALUES (?,?,?,?,?,?)""",
            (username, _hash(data.password, salt), salt, "staff", full_name, data.center_id),
        )
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=409, detail="That username is already taken.")
    conn.commit()
    new_id = cur.lastrowid
    row = conn.execute(
        """SELECT u.id, u.username, u.full_name, u.center_id, c.name AS center_name
           FROM users u LEFT JOIN health_centers c ON c.id = u.center_id
           WHERE u.id = ?""",
        (new_id,),
    ).fetchone()
    conn.close()
    return dict(row)


@router.post("/staff/{user_id}/password")
def reset_staff_password(user_id: int, data: PasswordIn, x_auth_token: str | None = Header(None)):
    require_admin(x_auth_token)
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password: at least 6 characters.")
    conn = get_connection()
    _get_staff(conn, user_id)
    salt = secrets.token_hex(16)
    conn.execute(
        "UPDATE users SET password_hash = ?, salt = ? WHERE id = ?",
        (_hash(data.password, salt), salt, user_id),
    )
    conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@router.post("/staff/{user_id}/center")
def change_staff_center(user_id: int, data: CenterIn, x_auth_token: str | None = Header(None)):
    require_admin(x_auth_token)
    conn = get_connection()
    _get_staff(conn, user_id)
    if not _center_exists(conn, data.center_id):
        conn.close()
        raise HTTPException(status_code=400, detail="Choose a valid health center.")
    conn.execute("UPDATE users SET center_id = ? WHERE id = ?", (data.center_id, user_id))
    conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@router.delete("/staff/{user_id}")
def remove_staff(user_id: int, x_auth_token: str | None = Header(None)):
    require_admin(x_auth_token)
    conn = get_connection()
    _get_staff(conn, user_id)
    conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return {"ok": True}