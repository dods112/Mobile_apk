from database import get_connection, init_db

init_db()
conn = get_connection()

# Only seed if the table is empty
if conn.execute("SELECT COUNT(*) FROM health_centers").fetchone()[0] == 0:
    conn.executemany(
        "INSERT INTO health_centers (name, barangay, contact_number, address, latitude, longitude) VALUES (?,?,?,?,?,?)",
        [
            ("Barangay X RHU", "Barangay X", "0900-000-0001", "Purok 1, Barangay X", 8.5000, 125.9700),
            ("Barangay Y RHU", "Barangay Y", "0900-000-0002", "Purok 2, Barangay Y", 8.5100, 125.9750),
            ("Barangay Z RHU", "Barangay Z", "0900-000-0003", "Purok 3, Barangay Z", 8.5200, 125.9800),
        ],
    )

    conn.executemany(
        "INSERT INTO items (health_center_id, name, category) VALUES (?,?,?)",
        [
            (1, "Amoxicillin 250mg", "medicine"),
            (1, "Paracetamol", "medicine"),
            (1, "ORS", "medicine"),
            (1, "BCG Vaccine", "vaccine"),
        ],
    )

    conn.executemany(
        "INSERT INTO item_aliases (item_id, alias) VALUES (?,?)",
        [(1, "amox"), (1, "amoxicillin"), (2, "para"), (2, "paracetamol"), (4, "bcg")],
    )

    conn.executemany(
        "INSERT INTO stock_status (item_id, status, updated_by) VALUES (?,?,?)",
        [(1, "out_of_stock", "Staff A"), (2, "in_stock", "Staff A"), (3, "low_stock", "Staff B"), (4, "in_stock", "Staff B")],
    )

    conn.commit()
    print("Test data added.")

conn.close()