"""Classes API router — read from cache, filter by instructor."""

from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_user
from app.models import UserInfo
from app.supabase_client import supabase

router = APIRouter(prefix="/api/classes", tags=["classes"])

# IST is UTC+5:30
IST = timezone(timedelta(hours=5, minutes=30))


def parse_datetime(date_str: str, time_str: str) -> datetime:
    """Parse date + time into a timezone-aware IST datetime.

    Handles date formats: MM/DD/YYYY, MM/DD/YY, YYYY-MM-DD
    Handles time formats: HH:MM AM/PM, HH:MM (24h)
    Falls back to midnight if time cannot be parsed.
    """
    dt = None
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(date_str.strip(), fmt)
            break
        except ValueError:
            continue
    if dt is None:
        return datetime.min.replace(tzinfo=IST)

    # Try to parse time component
    time_str = time_str.strip() if time_str else ""
    if time_str:
        for fmt in ("%I:%M %p", "%I:%M%p", "%H:%M"):
            try:
                t = datetime.strptime(time_str.upper(), fmt)
                dt = dt.replace(hour=t.hour, minute=t.minute)
                break
            except ValueError:
                continue

    return dt.replace(tzinfo=IST)


@router.get("")
async def get_classes(
    type: str = Query("upcoming", regex="^(upcoming|past)$"),
    limit: int = Query(5, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: UserInfo = Depends(get_current_user),
):
    """Get instructor's upcoming or past classes from cache."""
    now = datetime.now(IST)
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
        filtered.sort(key=lambda c: c["_parsed_dt"], reverse=True)

    # Paginate
    page = filtered[offset : offset + limit]

    # For past classes, flag those within last 2 days for the unavailability button
    cutoff = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=2)

    # Clean up internal field + add flags
    for c in page:
        if type == "past":
            c["_recent_past"] = c["_parsed_dt"] >= cutoff
        c.pop("_parsed_dt", None)
        # Ensure class_rating is a string for JSON serialization
        if "class_rating" in c:
            c["class_rating"] = str(c["class_rating"]) if c["class_rating"] not in (None, "") else ""

    return {
        "classes": page,
        "total": len(filtered),
        "offset": offset,
        "limit": limit,
    }


@router.get("/batch-options")
async def get_batch_options(user: UserInfo = Depends(get_current_user)):
    """Get unique batch names for the current instructor (for dropdowns)."""
    email = user.email.lower()
    batches = set()
    try:
        # We only really need to check upcoming classes for batch dropdown options
        response = supabase.table("classes").select("sb_names").eq("instructor_email", email).execute()
        for c in (response.data or []):
            batch = str(c.get("sb_names", "")).strip()
            if batch:
                batches.add(batch)
    except Exception as e:
        print(f"[ERROR] Failed to fetch batch options: {e}")
    return {"batches": sorted(batches)}


@router.get("/instructors")
async def get_instructor_options(user: UserInfo = Depends(get_current_user)):
    """Get unique instructor names from all classes (past + upcoming) for replacement dropdown."""
    instructors = set()
    try:
        response = supabase.table("classes").select("instructor_name").execute()
        for c in (response.data or []):
            name = str(c.get("instructor_name", "")).strip()
            if name and "scaler instructor" not in name.lower():
                instructors.add(name)
    except Exception as e:
        print(f"[ERROR] Failed to fetch instructors: {e}")
    return {"instructors": sorted(instructors)}


@router.get("/batch-metadata")
async def get_batch_metadata(user: UserInfo = Depends(get_current_user)):
    """Return program + upcoming module names per batch for the current instructor."""
    email = user.email.lower()
    now = datetime.now(IST)
    meta: dict = {}

    try:
        # Single query: all classes (global) to build batch->program map + instructor's classes for modules
        resp = supabase.table("classes").select("instructor_email,sb_names,program,module_name,class_date,time_of_day").execute()
        all_classes = resp.data or []
    except Exception as e:
        print(f"[ERROR] batch-metadata supabase error: {e}")
        return {"batch_metadata": {}}

    # 1. First pass: global batch -> program map
    batch_programs = {}
    for c in all_classes:
        batch = str(c.get("sb_names", "")).strip()
        program = str(c.get("program", "")).strip()
        if batch and program:
            batch_programs[batch] = program

    # 2. Second pass: instructor's batches + upcoming modules + last past class module
    last_past: dict = {}  # batch -> (parsed_dt, module_name) of the most recent past class

    for c in all_classes:
        if str(c.get("instructor_email", "")).strip().lower() != email:
            continue
        batch = str(c.get("sb_names", "")).strip()
        if not batch:
            continue
        if batch not in meta:
            meta[batch] = {"program": batch_programs.get(batch, ""), "modules": set()}
        date_str = str(c.get("class_date", "")).strip()
        time_str = str(c.get("time_of_day", "")).strip()
        if not date_str:
            continue
        parsed_dt = parse_datetime(date_str, time_str)
        mod = str(c.get("module_name", "")).strip()
        if parsed_dt >= now:
            # Upcoming class — add module directly
            if mod:
                meta[batch]["modules"].add(mod)
        else:
            # Past class — track the most recent one per batch
            if mod and (batch not in last_past or parsed_dt > last_past[batch][0]):
                last_past[batch] = (parsed_dt, mod)

    # Include the most recent past class's module for each batch
    for batch, (_, mod) in last_past.items():
        if batch in meta and mod:
            meta[batch]["modules"].add(mod)

    result = {
        batch: {"program": info["program"], "modules": sorted(info["modules"])}
        for batch, info in meta.items()
        if info["modules"]  # only include batches with at least one upcoming or last-past module
    }
    return {"batch_metadata": result}


@router.get("/my-batches")
async def get_my_batches(user: UserInfo = Depends(get_current_user)):
    """Return batches where the instructor has taken > 5 classes in total 
    (past + upcoming). For those batches, return all classes grouped by 
    batch → module, including those taken by other instructors (RI)."""
    from collections import defaultdict

    email = user.email.lower()

    # Step 1: Find all batches where this instructor has > 5 classes (past or upcoming)
    try:
        # We only need sb_names to count
        resp = supabase.table("classes").select("sb_names").eq("instructor_email", email).execute()
        my_classes = resp.data or []
    except Exception as e:
        print(f"[ERROR] my-batches supabase error (step 1): {e}")
        my_classes = []

    batch_counts = defaultdict(int)
    for c in my_classes:
        b = str(c.get("sb_names", "")).strip()
        if b:
            batch_counts[b] += 1

    qualifying_batches = [b for b, count in batch_counts.items() if count > 5]

    if not qualifying_batches:
        return {"batches": {}}

    # Step 2: Fetch ALL classes for these qualifying batches
    all_classes_for_batches = []
    
    try:
        resp2 = supabase.table("classes").select("*").in_("sb_names", qualifying_batches).execute()
        all_classes_for_batches = resp2.data or []
    except Exception as e:
        print(f"[ERROR] my-batches supabase error (step 2): {e}")
        all_classes_for_batches = []

    from collections import Counter

    # Step 3: Group all qualifying classes by batch -> module
    raw_groups: dict = defaultdict(lambda: defaultdict(list))
    
    for c in all_classes_for_batches:
        batch = str(c.get("sb_names", "")).strip()
        module = str(c.get("module_name", "")).strip()
        if not batch or not module:
            continue
        
        if batch in qualifying_batches:
            raw_groups[batch][module].append(c)

    # Step 4: Filter modules where the current instructor is the majority instructor
    my_groups: dict = defaultdict(lambda: defaultdict(list))
    for batch, modules in raw_groups.items():
        for module, classes in modules.items():
            # Find majority instructor for the module
            counts = Counter()
            for c in classes:
                instr = str(c.get("instructor_email", "")).strip().lower()
                counts[instr] += 1
            
            majority_email, _ = counts.most_common(1)[0]
            if majority_email != email:
                continue
            
            cleaned = []
            for c in classes:
                entry = {k: v for k, v in c.items() if not k.startswith("_")}
                # Mark classes taken by someone else
                entry["is_replacement"] = (str(c.get("instructor_email", "")).strip().lower() != email)
                cleaned.append(entry)
            
            cleaned.sort(
                key=lambda c: parse_datetime(
                    str(c.get("class_date", "")),
                    str(c.get("time_of_day", "")),
                )
            )
            my_groups[batch][module] = cleaned

    # Step 5: Build response
    result = {}
    for batch in sorted(my_groups.keys()):
        modules = my_groups[batch]
        if not modules:
            continue
            
        program = ""
        for mod_classes in modules.values():
            if mod_classes:
                program = str(mod_classes[0].get("program", ""))
                break
        result[batch] = {
            "program": program,
            "modules": {
                mod: modules[mod]
                for mod in sorted(modules.keys())
            },
        }

    return {"batches": result}
