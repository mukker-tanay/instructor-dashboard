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
    now = datetime.now(IST)
    email = user.email.lower()

    # Filter by instructor email
    user_classes = [
        c for c in cache.classes
        if str(c.get("Instructor Email", "")).strip().lower() == email
    ]

    # Parse date + time for accurate comparison
    for c in user_classes:
        c["_parsed_dt"] = parse_datetime(
            str(c.get("Date of Class (MM/DD/YYYY)", "")),
            str(c.get("Time of Class (HH:MM AM/PM) IST", "")),
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
    email = user.email.lower()
    batches = set()
    for c in cache.classes:
        if str(c.get("Instructor Email", "")).strip().lower() == email:
            batch = str(c.get("Batch Name", "")).strip()
            if batch:
                batches.add(batch)
    return {"batches": sorted(batches)}


@router.get("/instructors")
async def get_instructor_options(user: UserInfo = Depends(get_current_user)):
    """Get unique instructor names from all classes (for replacement dropdown)."""
    instructors = set()
    for c in cache.classes:
        name = str(c.get("Instructor Name", "")).strip()
        if name:
            instructors.add(name)
    return {"instructors": sorted(instructors)}


@router.get("/batch-metadata")
async def get_batch_metadata(user: UserInfo = Depends(get_current_user)):
    """Return program + upcoming module names per batch for the current instructor."""
    email = user.email.lower()
    now = datetime.now(IST)
    # batch -> { program, modules set }
    meta: dict = {}
    for c in cache.classes:
        if str(c.get("Instructor Email", "")).strip().lower() != email:
            continue
        batch = str(c.get("Batch Name", "")).strip()
        if not batch:
            continue

        if batch not in meta:
            meta[batch] = {
                "program": str(c.get("Program", "")).strip(),
                "modules": set(),
            }
        
        # Populate program if missing (in case earlier classes didn't have it)
        if not meta[batch]["program"]:
            meta[batch]["program"] = str(c.get("Program", "")).strip()

        # Only add modules if they are upcoming (optional, but requested behavior seems to be about program)
        # The user wants "Program" to be auto-filled.
        # Let's keep module logic as is (upcoming modules only?) or maybe all modules?
        # The original code filtered by date < now. 
        # "Upcoming module names" was the docstring.
        # But for "Program", we should potentialy look at any class.
        
        # Parse date to check if upcoming (for module list)
        date_str = str(c.get("Date of Class (MM/DD/YYYY)", "")).strip()
        time_str = str(c.get("Time of Class (HH:MM AM/PM) IST", "")).strip()
        if date_str:
            dt = parse_datetime(date_str, time_str)
            if dt >= now:
                mod = str(c.get("Module Name", "")).strip()
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
        batch = str(c.get("Batch Name", "")).strip()
        module = str(c.get("Module Name", "")).strip()
        if batch and module:
            groups[(batch, module)].append(c)

    # Step 2: For each group, find the majority instructor.
    # Keep the group only if the current user is the majority instructor.
    my_groups: dict = defaultdict(lambda: defaultdict(list))
    for (batch, module), classes in groups.items():
        # Count how many classes each instructor teaches in this group
        instructor_counts: Counter = Counter()
        for c in classes:
            instr = str(c.get("Instructor Email", "")).strip().lower()
            instructor_counts[instr] += 1

        # Majority instructor = whoever has the most classes
        majority_email, _ = instructor_counts.most_common(1)[0]
        if majority_email != email:
            continue

        # Sort classes by date within each module
        sorted_classes = sorted(
            classes,
            key=lambda c: parse_datetime(
                str(c.get("Date of Class (MM/DD/YYYY)", "")),
                str(c.get("Time of Class (HH:MM AM/PM) IST", "")),
            ),
        )

        # Strip internal fields and mark RI-taken classes
        cleaned = []
        for c in sorted_classes:
            entry = {k: v for k, v in c.items() if not k.startswith("_")}
            entry["is_replacement"] = (
                str(c.get("Instructor Email", "")).strip().lower() != email
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
                program = str(mod_classes[0].get("Program", ""))
                break
        result[batch] = {
            "program": program,
            "modules": {
                mod: modules[mod]
                for mod in sorted(modules.keys())
            },
        }

    return {"batches": result}
