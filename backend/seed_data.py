from database import get_connection, init_db

# Centers across Surigao del Sur. Coordinates are municipality centroids
# unless marked verified. Address labels show "(coords approx)" for unverified pins.
# seed_stock=True inserts initial stock rows; False keeps it as No Current Record.
CENTERS = [
    # (name, barangay, phone, address, lat, lng, seed_stock)
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

ITEMS = [
    ("Amoxicillin 250mg", "medicine", ["amox", "amoxicillin"]),
    ("Paracetamol", "medicine", ["para", "paracetamol"]),
    ("ORS", "medicine", ["ors"]),
    ("BCG Vaccine", "vaccine", ["bcg"]),
]

# starting stock per item, in the same order as ITEMS (only used when seed_stock=True)
STOCK_PLAN = ["out_of_stock", "in_stock", "low_stock", "in_stock"]


def reset_and_seed():
    init_db()
    conn = get_connection()

    total = conn.execute("SELECT COUNT(*) FROM health_centers").fetchone()[0]
    placeholders = conn.execute(
        "SELECT COUNT(*) FROM health_centers WHERE LOWER(name) LIKE '%placeholder%'"
    ).fetchone()[0]

    # Only reseed when the center list changed or leftover placeholders exist.
    if total == len(CENTERS) and placeholders == 0:
        conn.close()
        return

    for table in [
        "update_log", "resident_reports", "subscriptions", "stock_status",
        "item_aliases", "clinic_schedule", "items", "health_centers",
    ]:
        conn.execute(f"DELETE FROM {table}")

    for (name, barangay, phone, address, lat, lng, seed_stock) in CENTERS:
        cur = conn.execute(
            """INSERT INTO health_centers
               (name, barangay, contact_number, address, latitude, longitude)
               VALUES (?,?,?,?,?,?)""",
            (name, barangay, phone, address, lat, lng),
        )
        center_id = cur.lastrowid

        for item_pos, (item_name, category, aliases) in enumerate(ITEMS):
            cur = conn.execute(
                "INSERT INTO items (health_center_id, name, category) VALUES (?,?,?)",
                (center_id, item_name, category),
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