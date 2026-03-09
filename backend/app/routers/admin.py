"""Admin endpoints — view requests, approve/reject, delete."""

import asyncio
import logging
from datetime import datetime
from typing import List

from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies import require_admin
from app.models import UserInfo, StatusUpdateRequest
from app.supabase_client import supabase
from app.sheets import (
    sheets_service,
    UNAVAILABILITY_SHEET,
    CLASS_ADDITION_SHEET,
)
from app.slack import fire_slack_notification

router = APIRouter(prefix="/api/admin", tags=["admin"])




def _find_request(request_id: str):
    """Find a request by ID across both Supabase tables. Returns (record, type)."""
    try:
        res1 = supabase.table("unavailability_requests").select("*").eq("id", request_id).execute()
        if res1.data and len(res1.data) > 0:
            return res1.data[0], "unavailability"
            
        res2 = supabase.table("class_addition_requests").select("*").eq("id", request_id).execute()
        if res2.data and len(res2.data) > 0:
            return res2.data[0], "class_addition"
    except Exception as e:
        print(f"[ERROR] _find_request failed: {e}")
        
    return None, None


def _get_sheet_name(req_type: str) -> str:
    return UNAVAILABILITY_SHEET if req_type == "unavailability" else CLASS_ADDITION_SHEET


@router.get("/requests")
async def get_all_requests(
    status: str = Query("all", regex="^(all|Pending|Approved|Rejected)$"),
    request_type: str = Query("all", regex="^(all|unavailability|class_addition)$"),
    admin: UserInfo = Depends(require_admin),
):
    """Get all requests (admin view) from Supabase with optional filters."""
    results = []
    
    try:
        if request_type in ("all", "unavailability"):
            q1 = supabase.table("unavailability_requests").select("*")
            if status != "all":
                q1 = q1.eq("status", status)
            res1 = q1.execute()
            for r in (res1.data or []):
                # Ensure compatibility with frontend expecting old sheet headers alongside new snake_case
                r["Request ID"] = r.get("id")
                r["Status"] = r.get("status")
                r["Original Date of Class (MM/DD/YYYY)"] = r.get("original_date_of_class")
                r["Date of Class (MM/DD/YYYY)"] = r.get("original_date_of_class")
                r["Original Time of Class (HH:MM AM/PM) IST"] = r.get("original_time_of_class")
                r["Batch Name"] = r.get("batch_name")
                r["Instructor Name"] = r.get("instructor_name")
                r["Instructor Email"] = r.get("instructor_email")
                r["Class Title"] = r.get("class_title")
                r["Program"] = r.get("program")
                r["Class Type"] = r.get("class_type")
                r["Reason for Unavailability"] = r.get("reason_for_unavailability")
                results.append({**r, "request_type": "unavailability"})

        if request_type in ("all", "class_addition"):
            q2 = supabase.table("class_addition_requests").select("*")
            if status != "all":
                q2 = q2.eq("status", status)
            res2 = q2.execute()
            for r in (res2.data or []):
                r["Request ID"] = r.get("id")
                r["Status"] = r.get("status")
                r["Date of Class (MM/DD/YYYY)"] = r.get("date_of_class")
                r["Time of Class (HH:MM AM/PM) IST"] = r.get("time_of_class")
                r["Batch Name"] = r.get("batch_name")
                r["Instructor Name"] = r.get("instructor_name")
                r["Instructor Email"] = r.get("instructor_email")
                r["Class Title"] = r.get("class_title")
                r["Program"] = r.get("program")
                r["Class Type"] = r.get("class_type")
                r["Reason for Addition of Class"] = r.get("reason_for_addition")
                results.append({**r, "request_type": "class_addition"})
                
    except Exception as e:
        print(f"[ERROR] Failed to get all requests from Supabase: {e}")

    # Sort pending first, then by date dynamically mapped directly over parsed columns natively!
    def sort_key(r):
        s = str(r.get("Status", "")).strip()
        date_str = r.get("Date of Class (MM/DD/YYYY)", "")
        for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d"):
            try:
                d = datetime.strptime(str(date_str).strip(), fmt)
                return (0 if s == "Pending" else 1, d)
            except ValueError:
                continue
        return (0 if s == "Pending" else 1, datetime.max)

    results.sort(key=sort_key)

    return {"requests": results, "total": len(results)}


@router.patch("/requests/{request_id}/status")
async def update_request_status(
    request_id: str,
    body: StatusUpdateRequest,
    admin: UserInfo = Depends(require_admin),
):
    """Approve or reject a request (admin)."""
    record, req_type = _find_request(request_id)
    if not record:
        raise HTTPException(status_code=404, detail="Request not found.")

    # Check if already finalized
    # Check if already finalized
    current_status = str(record.get("status", record.get("Status", ""))).strip()
    
    # Allow updating "Approved" requests for Class Addition (to update payment status)
    if current_status == "Rejected":
        raise HTTPException(status_code=400, detail="Request already rejected.")
            
    if current_status == "Approved" and req_type == "unavailability":
         # Unavailability requests usually shouldn't change after approval (simplification)
         # But if you want to allow changing RI later, you can remove this check too.
         # For now, let's keep it strict for unavailability unless needed.
         raise HTTPException(status_code=400, detail="Unavailability request already finalized.")

    # Red flag validation
    if body.red_flag and body.red_flag.value == "Yes" and not body.red_flag_reason:
        raise HTTPException(status_code=400, detail="Red flag reason is required.")

    # Build updates for Supabase
    updates = {"status": body.status.value, "pushed_to_sheet": False}

    if req_type == "unavailability":
        if body.final_status:
            updates["final_status"] = body.final_status
        if body.replacement_instructor:
            updates["replacement_instructor"] = body.replacement_instructor

    if req_type == "class_addition":
        if body.payment_status:
            updates["class_added_on_class_day"] = body.payment_status.value
        if body.red_flag:
            updates["red_flag"] = body.red_flag.value
            if body.red_flag.value == "Yes" and body.red_flag_reason:
                updates["red_flag_proof"] = body.red_flag_reason

    if body.status.value == "Rejected" and body.rejection_reason:
        updates["rejection_reason"] = body.rejection_reason

    # Update in Supabase
    try:
        table_name = "unavailability_requests" if req_type == "unavailability" else "class_addition_requests"
        supabase.table(table_name).update(updates).eq("id", request_id).execute()
    except Exception as e:
        print(f"[ERROR] Failed to update request in Supabase: {e}")
        raise HTTPException(status_code=500, detail="Database update failed.")

    fire_slack_notification(
        f"✅ *Request {body.status.value}*\n"
        f"• Request ID: {request_id}\n"
        f"• By Admin: {admin.name} ({admin.email})"
    )

    return {"message": f"Request {body.status.value.lower()} successfully."}


logger = logging.getLogger(__name__)


class BulkDeleteRequest(BaseModel):
    request_ids: List[str]


@router.post("/requests/delete")
async def delete_requests(
    body: BulkDeleteRequest,
    admin: UserInfo = Depends(require_admin),
):
    """Bulk delete requests from Supabase (Sheets cleanup happens via /api/sync)."""
    if not body.request_ids:
        raise HTTPException(status_code=400, detail="No request IDs provided.")

    deleted_count = 0
    errors = []

    for rid in body.request_ids:
        record, req_type = _find_request(rid)
        if not record:
            errors.append(f"{rid}: not found")
            continue

        table = "unavailability_requests" if req_type == "unavailability" else "class_addition_requests"

        try:
            supabase.table(table).delete().eq("id", rid).execute()
        except Exception as e:
            errors.append(f"{rid}: Supabase delete failed ({e})")
            continue

        deleted_count += 1

    return {
        "message": f"{deleted_count} request(s) deleted.",
        "deleted": deleted_count,
        "errors": errors,
    }
