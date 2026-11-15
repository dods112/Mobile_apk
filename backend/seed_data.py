import sqlite3
from database import get_connection, init_db

CENTERS = [
    (
        "Tandag City Health Office and Birthing Clinic",
        "Dagocdoc",
        "086-214-3349",
        "290 Delicona Street, Barangay Dagocdoc, Tandag City, Surigao del Sur",
        9.0785, 126.1980, True,
    ),
    (
        "Tandag RHU 1",
        "Poblacion",
        "TBA",
        "Poblacion, Tandag City, Surigao del Sur (coords approx)",
        9.0800, 126.1985, True,
    ),
    (
        "Bislig District Hospital",
        "Poblacion",
        "TBA",
        "Bislig City, Surigao del Sur (coords approx)",
        8.2167, 126.3167, True,
    ),
    (
        "Lianga RHU",
        "Poblacion",
        "TBA",
        "Lianga, Surigao del Sur (coords approx)",
        8.6333, 126.1000, False,
    ),
    (
        "Barobo RHU",
        "Poblacion",
        "TBA",
        "Barobo, Surigao del Sur (coords approx)",
        8.5333, 126.2000, False,
    ),
    (
        "Hinatuan RHU",
        "Poblacion",
        "TBA",
        "Hinatuan, Surigao del Sur (coords approx)",
        8.3667, 126.3333, False,
    ),
    (
        "Cantilan RHU",
        "Poblacion",
        "TBA",
        "Cantilan, Surigao del Sur (coords approx)",
        9.3333, 125.9833, False,
    ),
]

# name, category, description, aliases
ITEMS = [
    ("Amoxicillin 250mg", "medicine", "Antibiotic para sa bacterial infections.", ["amox", "amoxicillin"]),
    ("Paracetamol", "medicine", "Para sa hilanat (fever) ug kasakit sa lawas (pain).", ["para", "paracetamol"]),
    ("ORS", "medicine", "Oral Rehydration Salts. Para sa dehydration o pagkalibang.", ["ors"]),
    ("BCG Vaccine", "vaccine", "Bakuna para sa pagpanalipod batok sa Tuberculosis (TB).", ["bcg"]),
]

STOCK_PLAN = ["out_of_stock", "in_stock", "low_stock", "in_stock"]


def reset_and_seed():
    conn = get_connection()
    
    # 1. Check if database needs to be reseeded or schema updated
    needs_reseed = False
    try:
        # Check if the new description column exists
        conn.execute("SELECT description FROM items LIMIT 1")
        
        # Check if center count matches
        total = conn.execute("SELECT COUNT(*) FROM health_centers").fetchone()[0]
        placeholders = conn.execute("SELECT COUNT(*) FROM health_centers WHERE LOWER(name) LIKE '%placeholder%'").fetchone()[0]
        
        if total != len(CENTERS) or placeholders > 0:
            needs_reseed = True
    except sqlite3.OperationalError:
        # Table or column doesn't exist, needs reseed
        needs_reseed = True
        
    if not needs_reseed:
        conn.close()
        return

    # 2. Drop ALL tables to handle schema changes cleanly
    conn.executescript("""
        DROP TABLE IF EXISTS item_aliases;
        DROP TABLE IF EXISTS stock_status;
        DROP TABLE IF EXISTS items;
        DROP TABLE IF EXISTS clinic_schedule;
        DROP TABLE IF EXISTS update_log;
        DROP TABLE IF EXISTS subscriptions;
        DROP TABLE IF EXISTS resident_reports;
        DROP TABLE IF EXISTS residents;
        DROP TABLE IF EXISTS health_centers;
        DROP TABLE IF EXISTS freshness_config;
    """)
    conn.commit()
    conn.close()
    
    # 3. Recreate the schema using the updated database.py
    init_db()
    conn = get_connection()

    # 4. Insert the seed data
    for (name, barangay, phone, address, lat, lng, seed_stock) in CENTERS:
        cur = conn.execute(
            """INSERT INTO health_centers
               (name, barangay, contact_number, address, latitude, longitude)
               VALUES (?,?,?,?,?,?)""",
            (name, barangay, phone, address, lat, lng),
        )
        center_id = cur.lastrowid

        for item_pos, (item_name, category, description, aliases) in enumerate(ITEMS):
            cur = conn.execute(
                "INSERT INTO items (health_center_id, name, category, description) VALUES (?,?,?,?)",
                (center_id, item_name, category, description),
            )
            item_id = cur.lastrowid

            for alias in aliases:
                conn.execute(
                    "INSERT INTO item_aliases (item_id, alias) VALUES (?,?)",
                    (item_id, alias),
                )

            if seed_stock:
                conn.execute(
                    "INSERT INTO stock_status (item_id, status, updated_by) VALUES (?,?,?)",
                    (item_id, STOCK_PLAN[item_pos], "Seed"),
                )

        for day in range(5):
            conn.execute(
                """INSERT INTO clinic_schedule
                   (health_center_id, service_name, day_of_week, start_time, end_time, is_cancelled)
                   VALUES (?,?,?,?,?,0)""",
                (center_id, "General Consultation", day, "08:00", "12:00"),
            )

    conn.commit()
    conn.close()