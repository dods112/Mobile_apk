import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "tanaw.db"


def get_connection():
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

    # Default freshness thresholds, inserted only once
    conn.execute("INSERT OR IGNORE INTO freshness_config (id) VALUES (1)")
    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    print("Database created at:", DB_PATH)