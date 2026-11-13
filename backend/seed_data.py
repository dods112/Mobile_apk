from database import get_connection, init_db

# PLACEHOLDER DATA: replace with verified RHU names, addresses, phone numbers,
# and coordinates before real use.
CENTERS = [
    ("Tandag RHU 1 (placeholder)", "Poblacion (placeholder)", "0900-000-1001", "Address to be verified", 9.0785, 126.1980),
    ("Tandag RHU 2 (placeholder)", "Barangay 2 (placeholder)", "0900-000-1002", "Address to be verified", 9.0650, 126.2050),
    ("Tandag RHU 3 (placeholder)", "Barangay 3 (placeholder)", "0900-000-1003", "Address to be verified", 9.0920, 126.1900),
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
    1: ["in_stock", "in_stock", "in_stock", "out_of_stock"],
    2: ["low_stock", "in_stock", "out_of_stock", "in_stock"],
}


def reset_and_seed():
    init_db()
    conn = get_connection()

    # Already seeded with the Tandag centers: keep whatever staff has changed
    existing = conn.execute(
        "SELECT COUNT(*) FROM health_centers WHERE barangay LIKE '%(placeholder)%'"
    ).fetchone()[0]
    if existing > 0:
        conn.close()
        return

    # Clear the old test data (children first)
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

        for day in range(5):  # Monday to Friday
            conn.execute(
                """INSERT INTO clinic_schedule
                   (health_center_id, service_name, day_of_week, start_time, end_time, is_cancelled)
                   VALUES (?,?,?,?,?,0)""",
                (center_id, "General Consultation", day, "08:00", "12:00"),
            )
        conn.execute(
            """INSERT INTO clinic_schedule
               (health_center_id, service_name, day_of_week, start_time, end_time, is_cancelled)
               VALUES (?,?,?,?,?,0)""",
            (center_id, "Immunization", 2, "13:00", "16:00"),
        )

    conn.commit()
    conn.close()