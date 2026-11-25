import os
import sqlite3
from database import get_connection, init_db

# Verified center. Phone and address from the public listing.
# TODO: confirm the phone by calling, and replace the coordinates with the exact Google Maps pin.
CENTERS = [
    (
        "Tandag City Health Office and Birthing Clinic",
        "Dagocdoc",
        "086-214-3349",
        "290 Delicona Street, Barangay Dagocdoc, Tandag City, Surigao del Sur",
        9.0785, 126.1980, True,
    ),
]

# Sample centers for local testing only. Turn on with TANAW_SAMPLE=1.
# Placed in Tandag City barangays. Not verified. Never show these to residents.
SAMPLE_CENTERS = [
    ("Poblacion Health Station (SAMPLE)", "Poblacion", "TBA", "Sample only, Poblacion, Tandag City", 9.0800, 126.1985, True),
    ("Mabuhay Health Station (SAMPLE)", "Mabuhay", "TBA", "Sample only, Mabuhay, Tandag City", 9.0620, 126.2050, True),
    ("Dapa Health Station (SAMPLE)", "Dapa", "TBA", "Sample only, Dapa, Tandag City", 9.0950, 126.1900, True),
]

ACTIVE_CENTERS = CENTERS + (SAMPLE_CENTERS if os.getenv("TANAW_SAMPLE") == "1" else [])

# Weekly hours per center: (weekday numbers, Monday = 0, start, end)
# Centers not listed here get Monday to Friday, 8:00 AM to 12:00 PM.
HOURS = {
    "Tandag City Health Office and Birthing Clinic": [(range(5), "08:00", "12:00")],
    "Poblacion Health Station (SAMPLE)": [(range(5), "13:00", "17:00")],
    "Mabuhay Health Station (SAMPLE)": [(range(6), "07:00", "11:00")],
    "Dapa Health Station (SAMPLE)": [(range(5), "08:00", "11:30")],
}

# Medicines and vaccines. Each entry: (name, category, description, aliases)
# Aliases are what residents may type, including common brand names. Keep them lowercase.
ITEMS = [
    ("Amoxicillin 250mg", "medicine", "Antibiotic para sa bacterial infections.", ["amox", "amoxicillin"]),
    ("Paracetamol", "medicine", "Para sa hilanat (fever) ug kasakit sa lawas (pain).", ["para", "paracetamol", "biogesic", "tempra", "tylenol"]),
    ("ORS", "medicine", "Oral Rehydration Salts. Para sa dehydration o pagkalibang.", ["ors", "oral rehydration"]),
    ("Ibuprofen", "medicine", "Para sa kasakit ug pamaga (pain and inflammation).", ["ibuprofen", "ibu", "medicol"]),
    ("Cetirizine", "medicine", "Para sa alerdyi (allergy), pang-pangati ug sip-on.", ["cetirizine", "cetirizin", "allerkid"]),
    ("Salbutamol", "medicine", "Para sa hangno (asthma) ug kalisud sa pagginhawa.", ["salbutamol", "ventolin"]),
    ("Lagundi", "medicine", "Herbal nga tambal para sa ubo.", ["lagundi", "lagundi syrup"]),
    ("Metformin", "medicine", "Para sa diabetes (sugar sa dugo).", ["metformin", "glucophage"]),
    ("Losartan", "medicine", "Para sa high blood pressure (hypertension).", ["losartan", "cozaar"]),
    ("Ferrous Sulfate", "medicine", "Pang-dugo (iron) para sa anemia.", ["ferrous", "iron", "ferrous sulfate"]),
    ("Vitamin C", "medicine", "Bitamina C para sa resistensya.", ["vitamin c", "bitamina", "ascorbic acid"]),
    ("Bioflu", "medicine", "Para sa sipon, ubo, ug hilanat (colds and flu).", ["bioflu", "neozep", "alaxan"]),
    ("BCG Vaccine", "vaccine", "Bakuna para sa pagpanalipod batok sa Tuberculosis (TB).", ["bcg"]),
    ("Tetanus Toxoid", "vaccine", "Bakuna batok sa tetano.", ["tt", "tetanus"]),
    ("Hepatitis B Vaccine", "vaccine", "Bakuna batok sa hepatitis B.", ["hepa b", "hepatitis"]),
]

# Stock for the verified center (placeholder until the health office confirms)
STOCK_PLAN = [
    "out_of_stock",  # Amoxicillin 250mg
    "in_stock",      # Paracetamol
    "low_stock",     # ORS
    "in_stock",      # Ibuprofen
    "in_stock",      # Cetirizine
    "low_stock",     # Salbutamol
    "in_stock",      # Lagundi
    "in_stock",      # Metformin
    "out_of_stock",  # Losartan
    "in_stock",      # Ferrous Sulfate
    "in_stock",      # Vitamin C
    "in_stock",      # Bioflu
    "in_stock",      # BCG Vaccine
    "in_stock",      # Tetanus Toxoid
    "in_stock",      # Hepatitis B Vaccine
]

# Stock for the sample centers: everything in stock, so referrals have somewhere to go
SAMPLE_STOCK = ["in_stock"] * len(ITEMS)

if len(STOCK_PLAN) != len(ITEMS):
    raise ValueError("STOCK_PLAN must have one status for each item in ITEMS")

DROP_SQL = """
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
"""


def _needs_reseed() -> bool:
    conn = get_connection()
    try:
        # Fails on an old schema that lacks the description column
        conn.execute("SELECT description FROM items LIMIT 1")
        names = {r["name"] for r in conn.execute("SELECT name FROM health_centers").fetchall()}
        if names != {c[0] for c in ACTIVE_CENTERS}:
            return True
        item_count = conn.execute("SELECT COUNT(*) FROM items").fetchone()[0]
        return item_count != len(ITEMS) * len(ACTIVE_CENTERS)
    except sqlite3.OperationalError:
        return True
    finally:
        conn.close()


def reset_and_seed():
    # Reseeds when the center list or medicine list changes. Staff updates are kept otherwise.
    if not _needs_reseed():
        return

    conn = get_connection()
    conn.executescript(DROP_SQL)
    conn.commit()
    conn.close()

    init_db()
    conn = get_connection()

    for name, barangay, phone, address, lat, lng, seed_stock in ACTIVE_CENTERS:
        cur = conn.execute(
            """INSERT INTO health_centers
               (name, barangay, contact_number, address, latitude, longitude)
               VALUES (?,?,?,?,?,?)""",
            (name, barangay, phone, address, lat, lng),
        )
        center_id = cur.lastrowid

        plan = SAMPLE_STOCK if "SAMPLE" in name else STOCK_PLAN

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
                    (item_id, plan[item_pos], "Seed"),
                )

        for days, start, end in HOURS.get(name, [(range(5), "08:00", "12:00")]):
            for day in days:
                conn.execute(
                    """INSERT INTO clinic_schedule
                       (health_center_id, service_name, day_of_week, start_time, end_time, is_cancelled)
                       VALUES (?,?,?,?,?,0)""",
                    (center_id, "General Consultation", day, start, end),
                )

    conn.commit()
    conn.close()