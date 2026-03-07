import sys

file_path = "backend/app/routers/classes.py"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 4. get_batch_metadata
old_metadata = """@router.get("/batch-metadata")
async def get_batch_metadata(user: UserInfo = Depends(get_current_user)):
    \"\"\"Return dict mapping: batch -> { program, list of modules }
    Only for batches where this instructor has upcoming classes.
    Uses global program mapping first to avoid blank programs.
    \"\"\"
    # Lazy Init
    try:
        cache.ensure_initialized()
    except Exception:
        pass

    email = user.email.lower()
    now = datetime.now(IST)
    # batch -> { program, modules set }
    meta: dict = {}
    
    # 1. First pass: Identify Program for every batch (Global Lookup)
    batch_programs = {}
    for c in cache.classes:
        batch = str(c.get("sb_names", "")).strip()
        program = str(c.get("program", "")).strip()
        if batch and program:
            batch_programs[batch] = program

    # 2. Second pass: Build metadata ONLY for instructor's batches
    for c in cache.classes:
        # Strict Filter: Only process if this instructor taught the class
        if str(c.get("instructor_email", "")).strip().lower() != email:
            continue

        batch = str(c.get("sb_names", "")).strip()
        if not batch:
            continue

        if batch not in meta:
            meta[batch] = {
                # Use global program lookup, fall back to empty string
                "program": batch_programs.get(batch, ""),
                "modules": set(),
            }

        # Parse date to check if upcoming
        date_str = str(c.get("class_date", "")).strip()
        time_str = str(c.get("time_of_day", "")).strip()
        if date_str:
            dt = parse_datetime(date_str, time_str)
            if dt >= now:
                mod = str(c.get("module_name", "")).strip()
                if mod:
                    meta[batch]["modules"].add(mod)"""

new_metadata = """@router.get("/batch-metadata")
async def get_batch_metadata(user: UserInfo = Depends(get_current_user)):
    \"\"\"Return dict mapping: batch -> { program, list of modules }
    Only for batches where this instructor has upcoming classes.
    Uses global program mapping first to avoid blank programs.
    \"\"\"
    email = user.email.lower()
    now = datetime.now(IST)
    meta: dict = {}
    
    try:
        # 1. First pass: Identify Program for every batch (Global Lookup)
        # Fetch bare minimum columns to save payload size
        resp_all = supabase.table("classes").select("sb_names, program").execute()
        batch_programs = {}
        for c in (resp_all.data or []):
            batch = str(c.get("sb_names", "")).strip()
            program = str(c.get("program", "")).strip()
            if batch and program:
                batch_programs[batch] = program

        # 2. Second pass: Build metadata ONLY for instructor's batches
        resp_user = supabase.table("classes").select("sb_names, class_date, time_of_day, module_name").eq("instructor_email", email).execute()
        for c in (resp_user.data or []):
            batch = str(c.get("sb_names", "")).strip()
            if not batch:
                continue

            if batch not in meta:
                meta[batch] = {
                    "program": batch_programs.get(batch, ""),
                    "modules": set(),
                }

            date_str = str(c.get("class_date", "")).strip()
            time_str = str(c.get("time_of_day", "")).strip()
            if date_str:
                dt = parse_datetime(date_str, time_str)
                if dt >= now:
                    mod = str(c.get("module_name", "")).strip()
                    if mod:
                        meta[batch]["modules"].add(mod)
                        
    except Exception as e:
        print(f"[ERROR] Failed to fetch batch metadata: {e}")"""

content = content.replace(old_metadata, new_metadata)

# 5. get_my_batches
old_mybatches = """@router.get("/my-batches")
async def get_my_batches(user: UserInfo = Depends(get_current_user)):
    \"\"\"Return batches from upcoming classes where this instructor is the majority
    instructor, grouped by batch → module. Includes RI-taken classes.\"\"\"
    from collections import Counter, defaultdict

    email = user.email.lower()
    now = datetime.now(IST)

    # Step 1: group UPCOMING classes by (batch, module) → list of classes
    groups: dict = defaultdict(list)
    for c in cache.classes:
        # Only include upcoming classes
        parsed_dt = parse_datetime(
            str(c.get("class_date", "")),
            str(c.get("time_of_day", "")),
        )
        if parsed_dt < now:
            continue
        batch = str(c.get("sb_names", "")).strip()
        module = str(c.get("module_name", "")).strip()
        if batch and module:
            groups[(batch, module)].append(c)"""

new_mybatches = """@router.get("/my-batches")
async def get_my_batches(user: UserInfo = Depends(get_current_user)):
    \"\"\"Return batches from upcoming classes where this instructor is the majority
    instructor, grouped by batch → module. Includes RI-taken classes.\"\"\"
    from collections import Counter, defaultdict

    email = user.email.lower()
    now = datetime.now(IST)

    # Step 1: group UPCOMING classes by (batch, module) → list of classes
    groups: dict = defaultdict(list)
    try:
        resp = supabase.table("classes").select("*").eq("class_category", "upcoming").execute()
        all_upcoming = resp.data or []
    except Exception as e:
        print(f"[ERROR] my-batches supabase error: {e}")
        all_upcoming = []

    for c in all_upcoming:
        # Only include upcoming classes
        parsed_dt = parse_datetime(
            str(c.get("class_date", "")),
            str(c.get("time_of_day", "")),
        )
        if parsed_dt < now:
            continue
        batch = str(c.get("sb_names", "")).strip()
        module = str(c.get("module_name", "")).strip()
        if batch and module:
            groups[(batch, module)].append(c)"""

content = content.replace(old_mybatches, new_mybatches)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("done metadata")
