import os
import sqlite3
from pathlib import Path

# Turso is used only when both variables are set (on Render).
# Locally they are not set, so the SQLite file is used as before.
TURSO_URL = (os.getenv("TURSO_DATABASE_URL") or "").strip() or None
TURSO_TOKEN = (os.getenv("TURSO_AUTH_TOKEN") or "").strip() or None
USE_TURSO = bool(TURSO_URL and TURSO_TOKEN)

# Shown in the Render Logs on every start
if (TURSO_URL and not TURSO_TOKEN) or (TURSO_TOKEN and not TURSO_URL):
    raise RuntimeError("Set both TURSO_DATABASE_URL and TURSO_AUTH_TOKEN, or neither.")
print("[db] Using Turso over HTTPS" if USE_TURSO else "[db] Using local SQLite (TURSO_* variables not set)")

DB_PATH = Path(os.getenv("DATABASE_PATH") or (Path(__file__).parent / "tanaw.db"))
if not USE_TURSO:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)


class _Row:
    # Lets code use row["column"], row[0], and dict(row), like sqlite3.Row
    def __init__(self, cols, vals):
        self._cols = cols
        self._vals = tuple(vals)

    def __getitem__(self, key):
        if isinstance(key, int):
            return self._vals[key]
        try:
            return self._vals[self._cols.index(key)]
        except ValueError:
            raise KeyError(key)

    def keys(self):
        return list(self._cols)

    def __iter__(self):
        return iter(self._vals)

    def __len__(self):
        return len(self._vals)


class _Cursor:
    def __init__(self, cur):
        self._cur = cur
        self._cols = [d[0] for d in (cur.description or [])]
        self.lastrowid = getattr(cur, "lastrowid", None)
        self.rowcount = getattr(cur, "rowcount", -1)

    def fetchone(self):
        row = self._cur.fetchone()
        return None if row is None else _Row(self._cols, row)

    def fetchall(self):
        return [_Row(self._cols, r) for r in self._cur.fetchall()]


def _map_error(exc):
    # Turns Turso errors into the sqlite3 errors the rest of the code expects
    msg = str(exc)
    if "UNIQUE" in msg.upper() or "CONSTRAINT" in msg.upper():
        return sqlite3.IntegrityError(msg)
    return sqlite3.OperationalError(msg)


class _TursoHTTP:
    # Turso over HTTPS. Used on Render. Keeps the same execute/commit/close API as sqlite3.
    def __init__(self, url, token):
        import requests
        self._session = requests.Session()
        self._session.headers.update({
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
        })
        self._endpoint = url.replace("libsql://", "https://", 1).rstrip("/") + "/v2/pipeline"
        self._pending = []  # statements run in one batch on commit

    def _run(self, requests_list):
        try:
            resp = self._session.post(self._endpoint, json={"requests": requests_list}, timeout=60)
        except Exception as exc:
            raise sqlite3.OperationalError("Cannot reach Turso: " + str(exc))
        if resp.status_code != 200:
            raise sqlite3.OperationalError("Turso returned HTTP %s: %s" % (resp.status_code, resp.text[:300]))
        data = resp.json()
        for r in data.get("results", []):
            if r.get("type") == "error":
                msg = (r.get("error") or {}).get("message", "Turso error")
                if "UNIQUE" in msg.upper() or "CONSTRAINT" in msg.upper():
                    raise sqlite3.IntegrityError(msg)
                raise sqlite3.OperationalError(msg)
        return data.get("results", [])

    def _arg(self, v):
        if v is None:
            return {"type": "null"}
        if isinstance(v, bool):
            return {"type": "integer", "value": str(int(v))}
        if isinstance(v, int):
            return {"type": "integer", "value": str(v)}
        if isinstance(v, float):
            return {"type": "float", "value": v}
        return {"type": "text", "value": str(v)}

    def execute(self, sql, params=()):
        stmt = {"sql": sql, "args": [self._arg(p) for p in tuple(params)]}
        # Reads run now so results can be returned; writes are sent right away too
        results = self._run([{"type": "execute", "stmt": stmt}, {"type": "close"}])
        return _TursoCursor(results[0]["response"]["result"])

    def executescript(self, script):
        for stmt in script.split(";"):
            if stmt.strip():
                self.execute(stmt.strip())

    def commit(self):
        return None  # each statement is applied as it runs

    def close(self):
        self._session.close()


class _TursoCursor:
    def __init__(self, result):
        self._cols = [c.get("name") for c in result.get("cols", [])]
        self._rows = [
            _Row(self._cols, [self._value(c) for c in row]) for row in result.get("rows", [])
        ]
        self.lastrowid = result.get("last_insert_rowid")
        self.rowcount = result.get("affected_row_count", -1)

    def _value(self, cell):
        if cell is None or cell.get("type") == "null":
            return None
        v = cell.get("value")
        if cell.get("type") == "integer":
            return int(v)
        if cell.get("type") == "float":
            return float(v)
        return v

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return list(self._rows)

def get_connection():
    if USE_TURSO:
        return _TursoHTTP(TURSO_URL, TURSO_TOKEN)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_connection()
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS health_centers (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        barangay TEXT NOT NULL,
        contact_number TEXT,
        address TEXT,
        latitude REAL,
        longitude REAL,
        is_participating BOOLEAN DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY,
        health_center_id INTEGER NOT NULL REFERENCES health_centers(id),
        name TEXT NOT NULL,
        category TEXT,
        description TEXT,
        is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS item_aliases (
        id INTEGER PRIMARY KEY,
        item_id INTEGER NOT NULL REFERENCES items(id),
        alias TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_status (
        id INTEGER PRIMARY KEY,
        item_id INTEGER NOT NULL REFERENCES items(id),
        status TEXT NOT NULL CHECK(status IN ('in_stock','low_stock','out_of_stock')),
        reason TEXT,
        expected_restock_date DATE,
        updated_by TEXT,
        status_changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_confirmed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        note TEXT
    );

    CREATE TABLE IF NOT EXISTS clinic_schedule (
        id INTEGER PRIMARY KEY,
        health_center_id INTEGER NOT NULL REFERENCES health_centers(id),
        service_name TEXT NOT NULL,
        day_of_week INTEGER,
        specific_date DATE,
        start_time TIME,
        end_time TIME,
        is_cancelled BOOLEAN DEFAULT 0,
        requirements TEXT,
        note TEXT
    );

    CREATE TABLE IF NOT EXISTS residents (
        id INTEGER PRIMARY KEY,
        contact_handle TEXT UNIQUE,
        default_health_center_id INTEGER REFERENCES health_centers(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY,
        resident_id INTEGER NOT NULL REFERENCES residents(id),
        item_id INTEGER NOT NULL REFERENCES items(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        fulfilled_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS resident_reports (
        id INTEGER PRIMARY KEY,
        resident_id INTEGER REFERENCES residents(id),
        item_id INTEGER REFERENCES items(id),
        health_center_id INTEGER REFERENCES health_centers(id),
        report_type TEXT,
        details TEXT,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reviewed BOOLEAN DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS update_log (
        id INTEGER PRIMARY KEY,
        health_center_id INTEGER NOT NULL REFERENCES health_centers(id),
        staff_name TEXT,
        action TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS freshness_config (
        id INTEGER PRIMARY KEY,
        fresh_max_hours INTEGER DEFAULT 24,
        aging_max_hours INTEGER DEFAULT 48
    );
    """)

    conn.execute("INSERT OR IGNORE INTO freshness_config (id) VALUES (1)")
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database created at:", DB_PATH)


EN_DESCRIPTIONS = {
    "Amoxicillin 250mg": "Antibiotic for bacterial infections.",
    "Paracetamol": "For fever and body pain.",
    "ORS": "Oral Rehydration Salts. For dehydration or diarrhea.",
    "Ibuprofen": "For pain and inflammation.",
    "Cetirizine": "For allergy, itching, and runny nose.",
    "Salbutamol": "For asthma and difficulty breathing.",
    "Lagundi": "Herbal medicine for cough.",
    "Metformin": "For diabetes (blood sugar).",
    "Losartan": "For high blood pressure (hypertension).",
    "Ferrous Sulfate": "Iron supplement for anemia.",
    "Vitamin C": "Vitamin C to support the immune system.",
    "Bioflu": "For colds, cough, and fever (colds and flu).",
    "BCG Vaccine": "Vaccine that protects against tuberculosis (TB).",
    "Tetanus Toxoid": "Vaccine against tetanus.",
    "Hepatitis B Vaccine": "Vaccine against hepatitis B.",
}


def ensure_english_column():
    # Adds description_en on any database that lacks it (local SQLite or Turso), then fills it
    conn = get_connection()
    cols = [r["name"] for r in conn.execute("PRAGMA table_info(items)").fetchall()]
    if "description_en" not in cols:
        conn.execute("ALTER TABLE items ADD COLUMN description_en TEXT")
    for name, text in EN_DESCRIPTIONS.items():
        conn.execute(
            "UPDATE items SET description_en = ? WHERE name = ? AND (description_en IS NULL OR description_en = '')",
            (text, name),
        )
    conn.commit()
    conn.close()