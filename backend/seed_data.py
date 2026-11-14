from database import get_connection, init_db

# Verified: Tandag City Health Office and Birthing Clinic
# Phone and address from the public listing. Confirm by calling before launch.
# TODO: replace the coordinates with the exact pin from Google Maps.
CENTERS = [
    (
        "Tandag City Health Office and Birthing Clinic",
        "Dagocdoc",
        "086-214-3349",
        "290 Delicona Street, Barangay Dagocdoc, Tandag City, Surigao del Sur",
        9.0785,
        126.1980,
    ),
]

ITEMS = [
    # (name, category, aliases)
    ("Amoxicillin 250mg", "medicine", ["amox", "amoxicillin"]),
    ("Paracetamol", "medicine", ["para", "paracetamol"]),
    ("ORS", "medicine", ["ors"]),
    ("BCG Vaccine", "vaccine", ["bcg"]),
]

# Starting stock per center, in the same order as ITEMS
STOCK_PLAN = {
    0: ["out_of_stock", "in_stock", "low_stock", "in_stock"],
}

SEED_MARKER = CENTERS[0][0]


def reset_and_seed():
    init_db()
    conn = get_connection()

    # Already seeded with the current verified data: keep staff changes
    existing = conn.execute(
        "SELECT COUNT(*) FROM health_centers WHERE name = ?", (SEED_MARKER,)
    ).fetchone()[0]
    if existing > 0:
        conn.close()
        return

    # Clear old data (children first)
    for table in [
        "update_log", "resident_reports", "subscriptions", "stock_status",
        "item_aliases", "clinic_schedule", "items", "health_centers",
    ]:
        conn.execute(f"DELETE FROM {table}")

    for idx, (name, barangay, phone, address, lat, lng) in enumerate(CENTERS):
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

            conn.execute(
                "INSERT INTO stock_status (item_id, status, updated_by) VALUES (?,?,?)",
                (item_id, STOCK_PLAN[idx][item_pos], "Staff A"),
            )

        # Weekday consultation hours: replace with the office's real schedule
        for day in range(5):
            conn.execute(
                """INSERT INTO clinic_schedule
                   (health_center_id, service_name, day_of_week, start_time, end_time, is_cancelled)
                   VALUES (?,?,?,?,?,0)""",
                (center_id, "General Consultation", day, "08:00", "12:00"),
            )

    conn.commit()
    conn.close()