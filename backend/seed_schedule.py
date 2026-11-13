from database import get_connection

conn = get_connection()

if conn.execute("SELECT COUNT(*) FROM clinic_schedule").fetchone()[0] == 0:
    conn.executemany(
        """INSERT INTO clinic_schedule
           (health_center_id, service_name, day_of_week, specific_date, start_time, end_time, is_cancelled, note)
           VALUES (?,?,?,?,?,?,?,?)""",
        [
            # Weekly pattern: Monday to Friday, 8 AM to 12 PM consultation
            (1, "General Consultation", 0, None, "08:00", "12:00", 0, None),
            (1, "General Consultation", 1, None, "08:00", "12:00", 0, None),
            (1, "General Consultation", 2, None, "08:00", "12:00", 0, None),
            (1, "General Consultation", 3, None, "08:00", "12:00", 0, None),
            (1, "General Consultation", 4, None, "08:00", "12:00", 0, None),
            # Weekly pattern: Immunization on Wednesdays, 1 PM to 4 PM
            (1, "Immunization", 2, None, "13:00", "16:00", 0, None),
        ],
    )
    conn.commit()
    print("Schedule data added.")

conn.close()