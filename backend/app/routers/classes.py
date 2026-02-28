"""Classes API router — read from cache, filter by instructor."""

from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_user
from app.models import UserInfo
from app.cache import cache

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
    # Lazy Init: if cache is empty (cold start), fetch now
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
        filtered.sort(key=lambda c: c["_parsed_dt"], reverse=True)

    # Paginate
    page = filtered[offset : offset + limit]

    # Clean up internal field
    for c in page:
        c.pop("_parsed_dt", None)

    return {
        "classes": page,
        "total": len(filtered),
        "offset": offset,
        "limit": limit,
    }


@router.get("/batch-options")
async def get_batch_options(user: UserInfo = Depends(get_current_user)):
    """Get unique batch names for the current instructor (for dropdowns)."""
    # Lazy Init
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
                batches.add(batch)
    return {"batches": sorted(batches)}


@router.get("/instructors")
async def get_instructor_options(user: UserInfo = Depends(get_current_user)):
    """Get unique instructor names from upcoming classes (for replacement dropdown)."""
    # Lazy Init
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
                instructors.add(name)
    return {"instructors": sorted(instructors)}


@router.get("/batch-metadata")
async def get_batch_metadata(user: UserInfo = Depends(get_current_user)):
    """Return program + upcoming module names per batch for the current instructor."""
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
                    meta[batch]["modules"].add(mod)

    result = {}
    for batch, info in meta.items():
        result[batch] = {
            "program": info["program"],
            "modules": sorted(info["modules"]),
        }
    return {"batch_metadata": result}


@router.get("/my-batches")
async def get_my_batches(user: UserInfo = Depends(get_current_user)):
    """Return all classes for batches where this instructor is the majority
    instructor, grouped by batch → module. Includes RI-taken classes."""
    from collections import Counter, defaultdict

    email = user.email.lower()

    # Step 1: group ALL classes by (batch, module) → list of classes
    groups: dict = defaultdict(list)
    for c in cache.classes:
        batch = str(c.get("sb_names", "")).strip()
        module = str(c.get("module_name", "")).strip()
        if batch and module:
            groups[(batch, module)].append(c)

    # Step 2: For each group, find the majority instructor.
    # Keep the group only if the current user is the majority instructor.
    my_groups: dict = defaultdict(lambda: defaultdict(list))
    for (batch, module), classes in groups.items():
        # Count how many classes each instructor teaches in this group
        instructor_counts: Counter = Counter()
        for c in classes:
            instr = str(c.get("instructor_email", "")).strip().lower()
            instructor_counts[instr] += 1

        # Majority instructor = whoever has the most classes
        majority_email, _ = instructor_counts.most_common(1)[0]
        if majority_email != email:
            continue

        # Sort classes by date within each module
        sorted_classes = sorted(
            classes,
            key=lambda c: parse_datetime(
                str(c.get("class_date", "")),
                str(c.get("time_of_day", "")),
            ),
        )

        # Strip internal fields and mark RI-taken classes
        cleaned = []
        for c in sorted_classes:
            entry = {k: v for k, v in c.items() if not k.startswith("_")}
            entry["is_replacement"] = (
                str(c.get("instructor_email", "")).strip().lower() != email
            )
            cleaned.append(entry)

        my_groups[batch][module] = cleaned

    # Step 3: Build response keyed by batch
    result = {}
    for batch in sorted(my_groups.keys()):
        modules = my_groups[batch]
        # Try to get program from any class in this batch
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
