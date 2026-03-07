import sys
import re

file_path = "backend/app/routers/admin.py"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add Supabase import
if "from app.supabase_client import supabase" not in content:
    content = content.replace("from app.cache import cache", "from app.cache import cache\nfrom app.supabase_client import supabase")


# 1. _find_request
old_find_req = """def _find_request(request_id: str):
    \"\"\"Find a request by ID across both request sheets. Returns (record, type).\"\"\"
    for r in cache.unavailability_requests:
        rid = str(r.get("request_id", r.get("Request ID", "")))
        if rid == request_id:
            return r, "unavailability"

    for r in cache.class_addition_requests:
        rid = str(r.get("request_id", r.get("Request ID", "")))
        if rid == request_id:
            return r, "class_addition"

    return None, None"""

new_find_req = """def _find_request(request_id: str):
    \"\"\"Find a request by ID across both Supabase tables. Returns (record, type).\"\"\"
    try:
        res1 = supabase.table("unavailability_requests").select("*").eq("id", request_id).execute()
        if res1.data and len(res1.data) > 0:
            return res1.data[0], "unavailability"
            
        res2 = supabase.table("class_addition_requests").select("*").eq("id", request_id).execute()
        if res2.data and len(res2.data) > 0:
            return res2.data[0], "class_addition"
    except Exception as e:
        print(f"[ERROR] _find_request failed: {e}")
        
    return None, None"""
content = content.replace(old_find_req, new_find_req)

# 2. get_all_requests replacement
old_get_all = """@router.get("/requests")
async def get_all_requests(
    status: str = Query("all", regex="^(all|Pending|Approved|Rejected)$"),
    request_type: str = Query("all", regex="^(all|unavailability|class_addition)$"),
    admin: UserInfo = Depends(require_admin),
):
    \"\"\"Get all requests (admin view) with optional filters.\"\"\"
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

    return {"requests": results, "total": len(results)}"""

new_get_all = """@router.get("/requests")
async def get_all_requests(
    status: str = Query("all", regex="^(all|Pending|Approved|Rejected)$"),
    request_type: str = Query("all", regex="^(all|unavailability|class_addition)$"),
    admin: UserInfo = Depends(require_admin),
):
    \"\"\"Get all requests (admin view) from Supabase with optional filters.\"\"\"
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
                r["Batch Name"] = r.get("batch_name")
                r["Instructor Name"] = r.get("instructor_name")
                r["Class Title"] = r.get("class_title")
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
                r["Batch Name"] = r.get("batch_name")
                r["Instructor Name"] = r.get("instructor_name")
                r["Class Title"] = r.get("class_title")
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

    return {"requests": results, "total": len(results)}"""

content = content.replace(old_get_all, new_get_all)

# 3. update_request_status 
old_update_status = """    # Find row in sheet and update
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

    # Write rejection reason if provided
    if body.status.value == "Rejected" and body.rejection_reason:
        rej_col = headers.get(
            "Reason for Rejection",
            headers.get("rejection_reason", headers.get("Rejection Reason")),
        )
        if rej_col:
            updates[rej_col] = body.rejection_reason


    if updates:
        await asyncio.to_thread(sheets_service.update_cells, sheet_name, row_num, updates)

    # Refresh cache
    await asyncio.to_thread(cache.force_refresh_requests)"""

new_update_status = """    # Build updates for Supabase
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
        raise HTTPException(status_code=500, detail="Database update failed.")"""
content = content.replace(old_update_status, new_update_status)

import builtins
with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("done rewriting admin.py entirely")
