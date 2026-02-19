"""Admin endpoints — view requests, approve/reject, locking."""

import asyncio
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies import require_admin
from app.models import UserInfo, StatusUpdateRequest
from app.cache import cache
from app.sheets import (
    sheets_service,
    UNAVAILABILITY_SHEET,
    CLASS_ADDITION_SHEET,
)
from app.slack import fire_slack_notification

router = APIRouter(prefix="/api/admin", tags=["admin"])

LOCK_EXPIRY_MINUTES = 10


def _find_request(request_id: str):
    """Find a request by ID across both request sheets. Returns (record, type)."""
    for r in cache.unavailability_requests:
        rid = str(r.get("request_id", r.get("Request ID", "")))
        if rid == request_id:
            return r, "unavailability"

    for r in cache.class_addition_requests:
        rid = str(r.get("request_id", r.get("Request ID", "")))
        if rid == request_id:
            return r, "class_addition"

    return None, None


def _get_sheet_name(req_type: str) -> str:
    return UNAVAILABILITY_SHEET if req_type == "unavailability" else CLASS_ADDITION_SHEET


@router.get("/requests")
async def get_all_requests(
    status: str = Query("all", regex="^(all|Pending|Approved|Rejected)$"),
    request_type: str = Query("all", regex="^(all|unavailability|class_addition)$"),
    admin: UserInfo = Depends(require_admin),
):
    """Get all requests (admin view) with optional filters."""
    # Lazy Init
    try:
        cache.ensure_initialized()
    except Exception:
        pass
    results = []

    if request_type in ("all", "unavailability"):
        for r in cache.unavailability_requests:
            results.append({**r, "request_type": "unavailability"})

    if request_type in ("all", "class_addition"):
        for r in cache.class_addition_requests:
            results.append({**r, "request_type": "class_addition"})

    # Filter by status
    if status != "all":
        results = [
            r for r in results
            if str(r.get("status", r.get("Status", ""))).strip() == status
        ]

    # Sort pending first, then by date
    def sort_key(r):
        s = str(r.get("status", r.get("Status", ""))).strip()
        date_str = r.get(
            "Original Date of Class (MM/DD/YYYY)",
            r.get("Date of Class (MM/DD/YYYY)", ""),
        )
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

    # Check lock
    locked_by = str(record.get("locked_by", "")).strip()
    locked_at = str(record.get("locked_at", "")).strip()
    if locked_by and locked_by != admin.email:
        # Check if lock expired
        try:
            lock_time = datetime.strptime(locked_at, "%m/%d/%Y %I:%M %p")
            if datetime.now() - lock_time < timedelta(minutes=LOCK_EXPIRY_MINUTES):
                raise HTTPException(
                    status_code=409,
                    detail=f"Request currently handled by {locked_by}",
                )
        except ValueError:
            pass

    # Red flag validation
    if body.red_flag and body.red_flag.value == "Yes" and not body.red_flag_reason:
        raise HTTPException(status_code=400, detail="Red flag reason is required.")

    # Find row in sheet and update
    sheet_name = _get_sheet_name(req_type)
    headers = await asyncio.to_thread(sheets_service.get_header_indices, sheet_name)

    # Find request_id column
    rid_col = headers.get("request_id", headers.get("Request ID"))
    if not rid_col:
        raise HTTPException(status_code=500, detail="Sheet schema error: no request_id column.")

    row_num = await asyncio.to_thread(
        sheets_service.find_row_by_value, sheet_name, rid_col, request_id
    )
    if not row_num:
        raise HTTPException(status_code=404, detail="Request row not found in sheet.")

    # Build updates
    updates = {}

    status_col = headers.get("status", headers.get("Status"))
    if status_col:
        updates[status_col] = body.status.value

    if req_type == "unavailability":
        if body.final_status:
            final_col = headers.get("Final status (Instructor change/ Reschedule to a class day/ Reschedule to a non-class day)")
            if final_col:
                updates[final_col] = body.final_status

        if body.replacement_instructor:
            ri_col = headers.get("Replacement Instructor")
            if ri_col:
                updates[ri_col] = body.replacement_instructor

    if req_type == "class_addition":
        if body.payment_status:
            sanc_col = headers.get(
                "Class Added on Class Day/Non-Class Day Sanctioned/Non-Sanctioned",
                headers.get("Sanctioned/Non-Sanctioned", headers.get("sanctioned")),
            )
            if sanc_col:
                updates[sanc_col] = body.payment_status.value

        if body.red_flag:
            rf_col = headers.get("Red Flag", headers.get("red_flag"))
            if rf_col:
                updates[rf_col] = body.red_flag.value

            if body.red_flag.value == "Yes" and body.red_flag_reason:
                proof_col = headers.get(
                    "If request has to be considered for red flag exception, please document proof here.",
                    headers.get("red_flag_proof"),
                )
                if proof_col:
                    updates[proof_col] = body.red_flag_reason

    # Clear lock
    lock_by_col = headers.get("locked_by")
    lock_at_col = headers.get("locked_at")
    if lock_by_col:
        updates[lock_by_col] = ""
    if lock_at_col:
        updates[lock_at_col] = ""

    if updates:
        await asyncio.to_thread(sheets_service.update_cells, sheet_name, row_num, updates)

    # Refresh cache
    await asyncio.to_thread(cache.force_refresh_requests)

    fire_slack_notification(
        f"✅ *Request {body.status.value}*\n"
        f"• Request ID: {request_id}\n"
        f"• By Admin: {admin.name} ({admin.email})"
    )

    return {"message": f"Request {body.status.value.lower()} successfully."}


@router.post("/requests/{request_id}/lock")
async def lock_request(
    request_id: str,
    admin: UserInfo = Depends(require_admin),
):
    """Lock a request for the current admin."""
    record, req_type = _find_request(request_id)
    if not record:
        raise HTTPException(status_code=404, detail="Request not found.")

    # Check existing lock
    locked_by = str(record.get("locked_by", "")).strip()
    locked_at = str(record.get("locked_at", "")).strip()
    if locked_by and locked_by != admin.email:
        try:
            lock_time = datetime.strptime(locked_at, "%m/%d/%Y %I:%M %p")
            if datetime.now() - lock_time < timedelta(minutes=LOCK_EXPIRY_MINUTES):
                raise HTTPException(
                    status_code=409,
                    detail=f"Request currently handled by {locked_by}",
                )
        except ValueError:
            pass

    sheet_name = _get_sheet_name(req_type)
    headers = await asyncio.to_thread(sheets_service.get_header_indices, sheet_name)

    rid_col = headers.get("request_id", headers.get("Request ID"))
    row_num = await asyncio.to_thread(
        sheets_service.find_row_by_value, sheet_name, rid_col, request_id
    )
    if not row_num:
        raise HTTPException(status_code=404, detail="Request row not found.")

    now = datetime.now().strftime("%m/%d/%Y %I:%M %p")
    updates = {}
    lock_by_col = headers.get("locked_by")
    lock_at_col = headers.get("locked_at")
    if lock_by_col:
        updates[lock_by_col] = admin.email
    if lock_at_col:
        updates[lock_at_col] = now

    if updates:
        await asyncio.to_thread(sheets_service.update_cells, sheet_name, row_num, updates)

    await asyncio.to_thread(cache.force_refresh_requests)

    return {"message": "Request locked.", "locked_by": admin.email, "locked_at": now}


@router.delete("/requests/{request_id}/lock")
async def unlock_request(
    request_id: str,
    admin: UserInfo = Depends(require_admin),
):
    """Release lock on a request."""
    record, req_type = _find_request(request_id)
    if not record:
        raise HTTPException(status_code=404, detail="Request not found.")

    sheet_name = _get_sheet_name(req_type)
    headers = await asyncio.to_thread(sheets_service.get_header_indices, sheet_name)

    rid_col = headers.get("request_id", headers.get("Request ID"))
    row_num = await asyncio.to_thread(
        sheets_service.find_row_by_value, sheet_name, rid_col, request_id
    )
    if not row_num:
        raise HTTPException(status_code=404, detail="Request row not found.")

    updates = {}
    lock_by_col = headers.get("locked_by")
    lock_at_col = headers.get("locked_at")
    if lock_by_col:
        updates[lock_by_col] = ""
    if lock_at_col:
        updates[lock_at_col] = ""

    if updates:
        await asyncio.to_thread(sheets_service.update_cells, sheet_name, row_num, updates)

    await asyncio.to_thread(cache.force_refresh_requests)

    return {"message": "Lock released."}
