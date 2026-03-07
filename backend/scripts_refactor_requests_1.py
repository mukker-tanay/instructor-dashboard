import sys

file_path = "backend/app/routers/requests.py"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add Supabase import
if "from app.supabase_client import supabase" not in content:
    content = content.replace("from app.cache import cache", "from app.cache import cache\nfrom app.supabase_client import supabase")

# 1. Duplicate Unavailability
old_dup_u = """def _check_duplicate_unavailability(email: str, batch: str, class_title: str, date_str: str) -> None:
    \"\"\"Block if an active (Pending) unavailability request already exists for the same class.\"\"\"
    for req in cache.unavailability_requests:
        req_email = str(req.get("Instructor Email", "")).strip().lower()
        req_status = str(req.get("status", req.get("Status", ""))).strip()
        if req_status != "Pending":
            continue
        req_batch = str(req.get("Batch Name", "")).strip()
        req_title = str(req.get("Class Title", "")).strip()
        req_date = str(req.get("Original Date of Class (MM/DD/YYYY)", "")).strip()
        if (
            req_email == email.lower()
            and req_batch == batch.strip()
            and req_title == class_title.strip()
            and req_date == date_str.strip()
        ):
            raise HTTPException(
                status_code=409,
                detail="An active unavailability request already exists for this class.",
            )"""

new_dup_u = """def _check_duplicate_unavailability(email: str, batch: str, class_title: str, date_str: str) -> None:
    \"\"\"Block if an active (Pending) unavailability request already exists for the same class.\"\"\"
    try:
        res = supabase.table("unavailability_requests").select("id").eq("instructor_email", email.lower()).eq("batch_name", batch.strip()).eq("class_title", class_title.strip()).eq("original_date_of_class", date_str.strip()).eq("status", "Pending").execute()
        if res.data and len(res.data) > 0:
            raise HTTPException(
                status_code=409,
                detail="An active unavailability request already exists for this class.",
            )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Failed duplicate check Supabase: {e}")"""
content = content.replace(old_dup_u, new_dup_u)

# 2. Duplicate Class Addition
old_dup_c = """def _check_duplicate_class_addition(email: str, batch: str, date_str: str, time_str: str) -> None:
    \"\"\"Block if an active (Pending) class addition request exists for the same batch+date+time.\"\"\"
    for req in cache.class_addition_requests:
        req_email = str(req.get("Instructor Email", "")).strip().lower()
        req_status = str(req.get("status", req.get("Status", ""))).strip()
        if req_status != "Pending":
            continue
        req_batch = str(req.get("Batch Name", "")).strip()
        req_date = str(req.get("Date of Class (MM/DD/YYYY)", "")).strip()
        req_time = str(req.get("Time of Class (HH:MM AM/PM) IST", "")).strip()
        if (
            req_email == email.lower()
            and req_batch == batch.strip()
            and req_date == date_str.strip()
            and req_time == time_str.strip()
        ):
            raise HTTPException(
                status_code=409,
                detail="An active class addition request already exists for this batch, date, and time.",
            )"""

new_dup_c = """def _check_duplicate_class_addition(email: str, batch: str, date_str: str, time_str: str) -> None:
    \"\"\"Block if an active (Pending) class addition request exists for the same batch+date+time.\"\"\"
    try:
        res = supabase.table("class_addition_requests").select("id").eq("instructor_email", email.lower()).eq("batch_name", batch.strip()).eq("date_of_class", date_str.strip()).eq("time_of_class", time_str.strip()).eq("status", "Pending").execute()
        if res.data and len(res.data) > 0:
            raise HTTPException(
                status_code=409,
                detail="An active class addition request already exists for this batch, date, and time.",
            )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Failed duplicate class addition check Supabase: {e}")"""
content = content.replace(old_dup_c, new_dup_c)

import builtins
with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("done")
