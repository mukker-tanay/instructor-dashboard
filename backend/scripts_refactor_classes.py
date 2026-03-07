import sys
import re

file_path = "backend/app/routers/classes.py"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add Supabase import
if "from app.supabase_client import supabase" not in content:
    content = content.replace("from app.cache import cache", "from app.cache import cache\nfrom app.supabase_client import supabase")

# 1. get_classes
old_get_classes = """    # Lazy Init: if cache is empty (cold start), fetch now
    try:
        cache.ensure_initialized()
    except Exception:
        pass  # If it fails, we still try to serve what we have or empty

    now = datetime.now(IST)
    email = user.email.lower()

    # Filter by instructor email
    user_classes = [
        c for c in cache.classes
        if str(c.get("instructor_email", "")).strip().lower() == email
    ]

    # Parse date + time for accurate comparison
    for c in user_classes:
        c["_parsed_dt"] = parse_datetime(
            str(c.get("class_date", "")),
            str(c.get("time_of_day", "")),
        )

    if type == "upcoming":
        filtered = [c for c in user_classes if c["_parsed_dt"] >= now]
        filtered.sort(key=lambda c: c["_parsed_dt"])
    else:
        filtered = [c for c in user_classes if c["_parsed_dt"] < now]
        filtered.sort(key=lambda c: c["_parsed_dt"], reverse=True)"""

new_get_classes = """    now = datetime.now(IST)
    email = user.email.lower()
    
    # Query Supabase dynamically
    try:
        response = supabase.table("classes").select("*").eq("instructor_email", email).eq("class_category", type).execute()
        user_classes = response.data or []
    except Exception as e:
        print(f"[ERROR] Failed to fetch classes from Supabase: {e}")
        user_classes = []

    # Parse date + time for accurate sorting
    for c in user_classes:
        c["_parsed_dt"] = parse_datetime(
            str(c.get("class_date", "")),
            str(c.get("time_of_day", "")),
        )

    if type == "upcoming":
        filtered = [c for c in user_classes if c["_parsed_dt"] >= now]
        filtered.sort(key=lambda c: c["_parsed_dt"])
    else:
        filtered = [c for c in user_classes if c["_parsed_dt"] < now]
        filtered.sort(key=lambda c: c["_parsed_dt"], reverse=True)"""

content = content.replace(old_get_classes, new_get_classes)

# 2. get_batch_options
old_batch_options = """    # Lazy Init
    try:
        cache.ensure_initialized()
    except Exception:
        pass

    email = user.email.lower()
    batches = set()
    for c in cache.classes:
        if str(c.get("instructor_email", "")).strip().lower() == email:
            batch = str(c.get("sb_names", "")).strip()
            if batch:
                batches.add(batch)"""

new_batch_options = """    email = user.email.lower()
    batches = set()
    try:
        # We only really need to check upcoming classes for batch dropdown options
        response = supabase.table("classes").select("sb_names").eq("instructor_email", email).execute()
        for c in (response.data or []):
            batch = str(c.get("sb_names", "")).strip()
            if batch:
                batches.add(batch)
    except Exception as e:
        print(f"[ERROR] Failed to fetch batch options: {e}")"""

content = content.replace(old_batch_options, new_batch_options)

# 3. get_instructor_options
old_instructors = """    # Lazy Init
    try:
        cache.ensure_initialized()
    except Exception:
        pass

    now = datetime.now(IST)
    instructors = set()
    for c in cache.classes:
        # Only include instructors from upcoming classes
        parsed = parse_datetime(
            str(c.get("class_date", "")),
            str(c.get("time_of_day", "")),
        )
        if parsed >= now:
            name = str(c.get("instructor_name", "")).strip()
            if name and "scaler instructor" not in name.lower():
                instructors.add(name)"""

new_instructors = """    now = datetime.now(IST)
    instructors = set()
    try:
        response = supabase.table("classes").select("instructor_name, class_date, time_of_day").eq("class_category", "upcoming").execute()
        for c in (response.data or []):
            parsed = parse_datetime(
                str(c.get("class_date", "")),
                str(c.get("time_of_day", "")),
            )
            if parsed >= now:
                name = str(c.get("instructor_name", "")).strip()
                if name and "scaler instructor" not in name.lower():
                    instructors.add(name)
    except Exception as e:
        print(f"[ERROR] Failed to fetch instructors: {e}")"""

content = content.replace(old_instructors, new_instructors)

import builtins
with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("done")
