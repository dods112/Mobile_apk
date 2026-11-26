from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from database import get_connection

router = APIRouter(prefix="/api/history", tags=["history"])

DEFAULT_TITLE = "New conversation"


def ensure_history_tables():
    conn = get_connection()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL DEFAULT 'New conversation',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_conv_user_updated
            ON conversations (user_id, updated_at);

        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            sender TEXT NOT NULL CHECK (sender IN ('user', 'ai')),
            message TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_msg_conv_time
            ON messages (conversation_id, created_at);
    """)
    conn.commit()
    conn.close()


def _now():
    return datetime.now(timezone.utc).isoformat()


def _title_from(text):
    clean = " ".join((text or "").split())
    if not clean:
        return DEFAULT_TITLE
    return clean if len(clean) <= 60 else clean[:57] + "..."


def _user_id(token):
    if not token:
        raise HTTPException(status_code=401, detail="Not signed in")
    conn = get_connection()
    row = conn.execute(
        """SELECT u.id, s.expires_at
           FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.token = ?""",
        (token,),
    ).fetchone()
    conn.close()
    if row is None or datetime.fromisoformat(row["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Not signed in")
    return row["id"]


def _owned(conn, conv_id, user_id):
    row = conn.execute(
        "SELECT id, title FROM conversations WHERE id = ? AND user_id = ?",
        (conv_id, user_id),
    ).fetchone()
    if row is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Conversation not found")
    return row


class NewConversation(BaseModel):
    title: str | None = None


class MessageIn(BaseModel):
    sender: str
    message: str


class RenameIn(BaseModel):
    title: str


@router.get("/conversations")
def list_conversations(q: str | None = None, x_auth_token: str | None = Header(None)):
    uid = _user_id(x_auth_token)
    conn = get_connection()
    params = [uid]
    search = ""
    if q and q.strip():
        like = f"%{q.strip()}%"
        search = """AND (c.title LIKE ? OR EXISTS (
                        SELECT 1 FROM messages m
                        WHERE m.conversation_id = c.id AND m.message LIKE ?))"""
        params += [like, like]
    rows = conn.execute(
        f"""SELECT c.id, c.title, c.created_at, c.updated_at,
               (SELECT m.message FROM messages m
                WHERE m.conversation_id = c.id
                ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS preview
            FROM conversations c
            WHERE c.user_id = ? {search}
            ORDER BY c.updated_at DESC, c.id DESC""",
        params,
    ).fetchall()
    conn.close()
    return [
        {
            "id": r["id"],
            "title": r["title"],
            "preview": (r["preview"] or "")[:120],
            "created_at": r["created_at"],
            "updated_at": r["updated_at"],
        }
        for r in rows
    ]


@router.post("/conversations")
def create_conversation(data: NewConversation, x_auth_token: str | None = Header(None)):
    uid = _user_id(x_auth_token)
    now = _now()
    title = _title_from(data.title or "")
    conn = get_connection()
    cur = conn.execute(
        "INSERT INTO conversations (user_id, title, created_at, updated_at) VALUES (?,?,?,?)",
        (uid, title, now, now),
    )
    conn.commit()
    conv_id = cur.lastrowid
    conn.close()
    return {"id": conv_id, "title": title, "created_at": now, "updated_at": now}


@router.get("/conversations/{conv_id}")
def get_conversation(conv_id: int, x_auth_token: str | None = Header(None)):
    uid = _user_id(x_auth_token)
    conn = get_connection()
    conv = _owned(conn, conv_id, uid)
    rows = conn.execute(
        """SELECT id, sender, message, created_at FROM messages
           WHERE conversation_id = ? ORDER BY created_at ASC, id ASC""",
        (conv_id,),
    ).fetchall()
    conn.close()
    return {
        "id": conv["id"],
        "title": conv["title"],
        "messages": [
            {"id": r["id"], "sender": r["sender"], "message": r["message"], "created_at": r["created_at"]}
            for r in rows
        ],
    }


@router.post("/conversations/{conv_id}/messages")
def add_message(conv_id: int, data: MessageIn, x_auth_token: str | None = Header(None)):
    uid = _user_id(x_auth_token)
    if data.sender not in ("user", "ai"):
        raise HTTPException(status_code=400, detail="sender must be 'user' or 'ai'")
    text = (data.message or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message is empty")

    now = _now()
    conn = get_connection()
    conv = _owned(conn, conv_id, uid)
    conn.execute(
        "INSERT INTO messages (conversation_id, sender, message, created_at) VALUES (?,?,?,?)",
        (conv_id, data.sender, text, now),
    )
    if data.sender == "user" and conv["title"] == DEFAULT_TITLE:
        conn.execute("UPDATE conversations SET title = ? WHERE id = ?", (_title_from(text), conv_id))
    conn.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (now, conv_id))
    conn.commit()
    conn.close()
    return {"ok": True, "updated_at": now}


@router.patch("/conversations/{conv_id}")
def rename_conversation(conv_id: int, data: RenameIn, x_auth_token: str | None = Header(None)):
    uid = _user_id(x_auth_token)
    title = _title_from(data.title)
    conn = get_connection()
    _owned(conn, conv_id, uid)
    conn.execute("UPDATE conversations SET title = ? WHERE id = ?", (title, conv_id))
    conn.commit()
    conn.close()
    return {"ok": True, "title": title}


@router.delete("/conversations/{conv_id}")
def delete_conversation(conv_id: int, x_auth_token: str | None = Header(None)):
    uid = _user_id(x_auth_token)
    conn = get_connection()
    _owned(conn, conv_id, uid)
    conn.execute("DELETE FROM messages WHERE conversation_id = ?", (conv_id,))
    conn.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@router.delete("/conversations")
def clear_all_conversations(x_auth_token: str | None = Header(None)):
    uid = _user_id(x_auth_token)
    conn = get_connection()
    conn.execute(
        "DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)",
        (uid,),
    )
    conn.execute("DELETE FROM conversations WHERE user_id = ?", (uid,))
    conn.commit()
    conn.close()
    return {"ok": True}