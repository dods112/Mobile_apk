from fastapi import APIRouter, Depends, HTTPException

from auth import require_staff
from database import get_connection

router = APIRouter(prefix="/api/staff", tags=["staff"], dependencies=[Depends(require_staff)])


@router.post("/reports/{report_id}/review")
def mark_reviewed(report_id: int, user: dict = Depends(require_staff)):
    conn = get_connection()
    row = conn.execute(
        "SELECT health_center_id FROM resident_reports WHERE id = ?", (report_id,)
    ).fetchone()
    if row is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Report not found")

    conn.execute("UPDATE resident_reports SET reviewed = 1 WHERE id = ?", (report_id,))
    if row["health_center_id"] is not None:
        conn.execute(
            "INSERT INTO update_log (health_center_id, staff_name, action) VALUES (?,?,?)",
            (row["health_center_id"], user["full_name"] or user["username"], f"Report #{report_id}: reviewed"),
        )
    conn.commit()
    conn.close()
    return {"ok": True}