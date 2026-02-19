"""Instructor request endpoints — unavailability and class addition."""

import uuid
import asyncio
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_current_user
from app.models import (
    UserInfo,
    UnavailabilityRequestCreate,
    ClassAdditionRequestCreate,
)
from app.cache import cache
from app.sheets import sheets_service, UNAVAILABILITY_SHEET, CLASS_ADDITION_SHEET
from app.slack import fire_slack_notification

router = APIRouter(prefix="/api", tags=["requests"])




def _check_duplicate_unavailability(email: str, batch: str, class_title: str, date_str: str) -> None:
    """Block if an active (Pending) unavailability request already exists for the same class."""
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
            )


def _check_duplicate_class_addition(email: str, batch: str, date_str: str, time_str: str) -> None:
    """Block if an active (Pending) class addition request exists for the same batch+date+time."""
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
            )


@router.post("/unavailability-requests")
async def create_unavailability_request(
    body: UnavailabilityRequestCreate,
    user: UserInfo = Depends(get_current_user),
):
    """Raise unavailability request for one or more classes."""
    results = []

    for cls in body.classes:
        date_str = str(cls.get("date_of_class", cls.get("Date of Class (MM/DD/YYYY)", "")))
        time_str = str(cls.get("time_of_class", cls.get("Time of Class (HH:MM AM/PM) IST", "")))

        # Validations
        batch = str(cls.get('batch_name', cls.get('Batch Name', '')))
        title = str(cls.get('class_title', cls.get('Class Title', '')))
        _check_duplicate_unavailability(user.email, batch, title, date_str)

        request_id = str(uuid.uuid4())
        now = datetime.now().strftime("%m/%d/%Y %I:%M %p")

        # Row order matches sheet headers exactly:
        # Instructor Email, Instructor Name, Program, Batch Name, SBAT Group ID,
        # Module Name, Class Title, Original Date of Class (MM/DD/YYYY),
        # Original Time of Class (HH:MM AM/PM) IST, Class Type,
        # Reason for Unavailability, Any Other Comments,
        # Suggested Instructors for Replacement,
        # Topics & Promises from Previous Class,
        # Batch Pulse & Persona, Recommended Teaching Pace & Style,
        # Raised Timestamp, Raised By, Slack Thread Link,
        # Final status (...), Replacement Instructor,
        # Class rating in case of replacement, RI taking the class,
        # Red flag proof, request_id, status, locked_by, locked_at
        row = [
            user.email,                                                         # Instructor Email
            user.name,                                                          # Instructor Name
            cls.get("program", cls.get("Program", "")),                         # Program
            cls.get("batch_name", cls.get("Batch Name", "")),                   # Batch Name
            cls.get("sbat_group_id", cls.get("SBAT Group ID", "")),             # SBAT Group ID
            cls.get("module_name", cls.get("Module Name", "")),                 # Module Name
            cls.get("class_title", cls.get("Class Title", "")),                 # Class Title
            date_str,                                                           # Original Date of Class (MM/DD/YYYY)
            time_str,                                                           # Original Time of Class (HH:MM AM/PM) IST
            cls.get("class_type", cls.get("Class Type (Regular/Optional)", cls.get("Class Type", ""))),  # Class Type
            body.reason,                                                        # Reason for Unavailability
            body.other_comments or "",                                          # Any Other Comments
            body.suggested_replacement or "",                                   # Suggested Instructors for Replacement
            body.topics_and_promises,                                           # Topics & Promises from Previous Class
            body.batch_pulse_persona,                                           # Batch Pulse & Persona
            body.teaching_pace_style,                                           # Recommended Teaching Pace & Style
            now,                                                                # Raised Timestamp
            user.email,                                                         # Raised By
            "",                                                                 # Slack Thread Link
            "",                                                                 # Final status
            "",                                                                 # Replacement Instructor
            "",                                                                 # Class rating in case of replacement
            "",                                                                 # RI taking the class
            "",                                                                 # Red flag proof
            request_id,                                                         # request_id
            "Pending",                                                          # status
            "",                                                                 # locked_by
            "",                                                                 # locked_at
        ]

        await asyncio.to_thread(sheets_service.append_row, UNAVAILABILITY_SHEET, row)
        results.append({"request_id": request_id, "class": cls.get("class_title", cls.get("Class Title", ""))})

        # Build Slack message matching the reference format
        batch_name = cls.get('batch_name', cls.get('Batch Name', ''))
        program = cls.get('program', cls.get('Program', ''))
        sbat = cls.get('sbat_group_id', cls.get('SBAT Group ID', ''))
        module = cls.get('module_name', cls.get('Module Name', ''))
        class_title = cls.get('class_title', cls.get('Class Title', ''))
        class_type = cls.get('class_type', cls.get('Class Type (Regular/Optional)', cls.get('Class Type', '')))


        # Standard CC List
        STANDARD_CC_LIST = [
            "Amar Srivastava", "Rishabh Gupta", "Vagesh Garg", 
            "classroom_program", "dsml-ops-group"
        ]

        # Helper to lookup IDs and format tags
        all_mapping_records = sheets_service.get_all_records("ID mapping")
        
        def get_slack_tag(name: str) -> str:
            clean_name = name.strip().lower()
            member_id = ""
            for r in all_mapping_records:
                if str(r.get("Name", "")).strip().lower() == clean_name:
                    member_id = str(r.get("Member ID", "")).strip()
                    break
            
            if member_id:
                # User Group IDs usually start with 'S', Users with 'U' or 'W'
                if member_id.startswith("S"):
                     return f"<!subteam^{member_id}>"
                return f"<@{member_id}>"
            return name # Fallback to name

        # Tag Approvers
        tagged_approvers = [get_slack_tag(name) for name in body.approvers]
        approvers_str = ", ".join(tagged_approvers) if tagged_approvers else "None"

        # Tag CCs
        tagged_ccs = [get_slack_tag(name) for name in STANDARD_CC_LIST]
        ccs_str = ", ".join(tagged_ccs)

        # 1. Main Message: Key Info
        main_msg = (
            f"🚨 *New Unavailability Request*\n"
            f"*Class:* {class_title}\n"
            f"*Instructor:* {user.name} ({user.email})\n"
            f"*Date:* {date_str} {time_str}\n"
            f"*Batch:* {batch_name} ({program})\n"
            f"*Reason:* {body.reason}\n"
            f"*Approvers:* {approvers_str}\n"
            f"*CC:* {ccs_str}"
        )

        # 2. Detailed Message (Thread)
        detail_msg = (
            f"*Full Details:*\n"
            f"• *Module:* {module}\n"
            f"• *SBAT Group:* {sbat}\n"
            f"• *Class Type:* {class_type}\n"
            f"• *Other Comments:* {body.other_comments or 'N/A'}\n"
            f"• *Suggested Replacement:* {body.suggested_replacement or 'N/A'}\n"
            f"• *Topics & Promises:* {body.topics_and_promises}\n"
            f"• *Batch Pulse:* {body.batch_pulse_persona}\n"
            f"• *Teaching Style:* {body.teaching_pace_style}"
        )

        # Fetch batch metrics
        try:
            metrics = await asyncio.to_thread(sheets_service.get_batch_metrics, str(batch_name))
            if metrics:
                # Extract values to variables for cleaner f-string
                nps = metrics.get('Batch NPS', 'N/A')
                reschedules = metrics.get('Reschedules in this module', 'N/A')
                break_days = metrics.get('No of break class days', 'N/A')
                remaining = metrics.get("How many classes are remaining in this module?", "N/A")
                completed = metrics.get('Classes Completed', 'N/A')
                ri_count = metrics.get("No of RI's allocated", "N/A")
                ri_names = metrics.get("RI's Allocated", "N/A")

                detail_msg += (
                    f"\n\n*Batch Metrics:*\n"
                    f"Batch NPS: {nps}\n"
                    f"Number of reschedules in the current module: {reschedules}\n"
                    f"Number of break days between the end of this module and the start of the next: {break_days} class days\n"
                    f"How many classes are remaining in this module?: {remaining}\n"
                    f"Classes completed in this module: {completed}\n"
                    f"Number of RIs deployed in this module so far, along with names: {ri_count}, {ri_names}"
                )
        except Exception:
            pass

        # Send Main Message -> Get TS -> Send Details in Thread
        # We need to do this asynchronously but essentially sequentially for this request context
        # to ensure we have the TS.
        # Since fire_slack_notification is fire-and-forget, we'll wrap this logic in a small async function
        # and fire THAT as a background task.
        
        async def send_threaded():
            from app.slack import send_slack_notification
            ts = await send_slack_notification(main_msg)
            if ts:
                await send_slack_notification(detail_msg, thread_ts=ts)
        
        loop = asyncio.get_running_loop()
        loop.create_task(send_threaded())

    # Refresh cache after write
    await asyncio.to_thread(cache.force_refresh_requests)

    return {"message": "Unavailability request(s) submitted.", "requests": results}


@router.post("/class-addition-requests")
async def create_class_addition_request(
    body: ClassAdditionRequestCreate,
    user: UserInfo = Depends(get_current_user),
):
    """Raise a class addition request."""
    # Duplicate check
    _check_duplicate_class_addition(user.email, body.batch_name, body.date_of_class, body.time_of_class)

    request_id = str(uuid.uuid4())
    now = datetime.now().strftime("%m/%d/%Y %I:%M %p")

    # Row order matches sheet headers exactly:
    row = [
        user.email,                     # Instructor Email
        user.name,                      # Instructor Name
        body.program,                   # Program
        body.batch_name,                # Batch Name
        body.class_title,               # Class Title
        body.module_name,               # Module Name
        body.date_of_class,             # Date of Class (MM/DD/YYYY)
        body.time_of_class,             # Time of Class (HH:MM AM/PM) IST
        body.class_type,                # Class Type (Regular/Optional)
        body.shift_other_classes,       # Shift other Classes by 1(Yes/No)
        body.contest_impact,            # Will this addition affect the live contest date?
        body.assignment_requirement,    # Requirement of Assignment & Homework
        body.reason,                    # Reason for Addition of Class
        body.other_comments or "",      # Other Comments
        ", ".join(body.approvers),      # Select Approver (Joined list)
        user.email,                     # Submitted by
        now,                            # Time stamp
        "",                             # Slack Thread Link
        "",                             # Actual Date of Class
        "",                             # Class Added on Class Day/Non-Class Day Sanctioned/Non-Sanctioned
        "",                             # Slack Link
        "",                             # Red Flag
        request_id,                     # request_id
        "Pending",                      # status
        "",                             # locked_by
        "",                             # locked_at
    ]

    await asyncio.to_thread(sheets_service.append_row, CLASS_ADDITION_SHEET, row)

    # --- Slack Notification (Bot API with Tagging) ---
    
    # Helper to lookup IDs and format tags (Copied from unavailability - ideally refactor to util)
    all_mapping_records = sheets_service.get_all_records("ID mapping")
    
    def get_slack_tag(name: str) -> str:
        clean_name = name.strip().lower()
        member_id = ""
        for r in all_mapping_records:
            if str(r.get("Name", "")).strip().lower() == clean_name:
                member_id = str(r.get("Member ID", "")).strip()
                break
        
        if member_id:
            if member_id.startswith("S"):
                    return f"<!subteam^{member_id}>"
            return f"<@{member_id}>"
        return name

    STANDARD_CC_LIST = [
        "Amar Srivastava", "Rishabh Gupta", "Vagesh Garg", 
        "classroom_program", "dsml-ops-group"
    ]

    tagged_approvers = [get_slack_tag(name) for name in body.approvers]
    approvers_str = ", ".join(tagged_approvers) if tagged_approvers else "None"
    
    tagged_ccs = [get_slack_tag(name) for name in STANDARD_CC_LIST]
    ccs_str = ", ".join(tagged_ccs)

    slack_msg = (
        f"🚨 *New Class Addition Request*\n"
        f"*Instructor:* {user.name} ({user.email})\n"
        f"*Batch:* {body.batch_name} ({body.program})\n"
        f"*Class:* {body.class_title} ({body.module_name})\n"
        f"*Proposed Date:* {body.date_of_class} {body.time_of_class}\n"
        f"*Reason:* {body.reason}\n"
        f"*Approvers:* {approvers_str}\n"
        f"*CC:* {ccs_str}\n\n"
        f"*Details:*\n"
        f"• Type: {body.class_type}\n"
        f"• Shift Others: {body.shift_other_classes}\n"
        f"• Contest Impact: {body.contest_impact}\n"
        f"• Assignments: {body.assignment_requirement}\n"
        f"• Comments: {body.other_comments or 'N/A'}"
    )

    # Fire and forget using the Bot API helper
    async def send_notification():
        from app.slack import send_slack_notification
        await send_slack_notification(slack_msg)

    asyncio.create_task(send_notification())

    await asyncio.to_thread(cache.force_refresh_requests)

    return {"message": "Class addition request submitted.", "request_id": request_id}


@router.get("/my-requests")
async def get_my_requests(user: UserInfo = Depends(get_current_user)):
    """Get all requests raised by the current instructor."""
    email = user.email.lower()

    unavailability = [
        {**r, "request_type": "unavailability"}
        for r in cache.unavailability_requests
        if str(r.get("Instructor Email", "")).strip().lower() == email
    ]

    additions = [
        {**r, "request_type": "class_addition"}
        for r in cache.class_addition_requests
        if str(r.get("Instructor Email", "")).strip().lower() == email
    ]

    all_requests = unavailability + additions

    # Sort by timestamp descending
    def sort_key(r):
        ts = r.get("Raised Timestamp", r.get("Time stamp", r.get("timestamp", "")))
        for fmt in ("%m/%d/%Y %I:%M %p", "%m/%d/%Y %H:%M", "%Y-%m-%d %H:%M"):
            try:
                return datetime.strptime(str(ts).strip(), fmt)
            except ValueError:
                continue
        return datetime.min

    all_requests.sort(key=sort_key, reverse=True)

    return {"requests": all_requests, "total": len(all_requests)}
