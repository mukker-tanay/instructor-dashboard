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
        date_str = str(cls.get("date_of_class", cls.get("class_date", "")))
        time_str = str(cls.get("time_of_class", cls.get("time_of_day", "")))

        # Validations
        batch = str(cls.get('batch_name', cls.get('sb_names', '')))
        title = str(cls.get('class_title', cls.get('class_topic', '')))
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
            cls.get("program", ""),                                          # Program
            cls.get("batch_name", cls.get("sb_names", "")),                    # Batch Name
            cls.get("sbat_group_id", ""),                                      # SBAT Group ID
            cls.get("module_name", ""),                                        # Module Name
            cls.get("class_title", cls.get("class_topic", "")),               # Class Title
            date_str,                                                           # Original Date of Class (MM/DD/YYYY)
            time_str,                                                           # Original Time of Class (HH:MM AM/PM) IST
            cls.get("class_type", ""),                                         # Class Type
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
        results.append({"request_id": request_id, "class": cls.get("class_title", cls.get("class_topic", ""))})

        # ─── Slack Workflow Notification ───
        batch_name  = cls.get('batch_name', cls.get('sb_names', ''))
        program     = cls.get('program', '')
        sbat        = cls.get('sbat_group_id', '')
        module      = cls.get('module_name', '')
        class_title = cls.get('class_title', cls.get('class_topic', ''))
        class_type  = cls.get('class_type', '')

        # Look up raw Slack ID for suggested_replacement (Workflow 'Slack user' variable)
        all_mapping_records = await asyncio.to_thread(sheets_service.get_all_records, "ID mapping")

        def get_slack_id(name: str) -> str:
            """Return raw Slack member ID for a name, or empty string if not found."""
            if not name:
                return ""
            clean = name.strip().lower()
            for r in all_mapping_records:
                if str(r.get("Name", "")).strip().lower() == clean:
                    return str(r.get("Member ID", "")).strip()
            return ""

        workflow_data = {
            "instructor_email":      user.email,
            "instructor_name":       user.name,
            "program":               program,
            "batch_name":            batch_name,
            "sbat_group_id":         str(sbat),
            "class_title":           class_title,
            "module_name":           module,
            "date_of_class":         date_str,
            "time_of_class":         time_str,
            "class_type":            class_type,
            "reason":                body.reason,
            "other_comments":        body.other_comments or "",
            "suggested_replacement": get_slack_id(body.suggested_replacement or ""),
            "topics_and_promises":   body.topics_and_promises,
            "batch_pulse_persona":   body.batch_pulse_persona,
            "teaching_pace_style":   body.teaching_pace_style,
        }

        _data = workflow_data  # capture per-iteration value for the closure
        async def _send_unavail(data=_data):
            from app.slack import send_workflow_payload
            from app.config import settings
            await send_workflow_payload(settings.slack_unavailability_webhook, data)

        asyncio.get_running_loop().create_task(_send_unavail())

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

    # ─── Slack Workflow Notification ───
    # Look up the approver's raw Slack user ID (Workflow 'Slack user' variable type)
    all_mapping_records = await asyncio.to_thread(sheets_service.get_all_records, "ID mapping")

    def get_slack_id(name: str) -> str:
        """Return raw Slack member ID for a name, or empty string if not found."""
        if not name:
            return ""
        clean = name.strip().lower()
        for r in all_mapping_records:
            if str(r.get("Name", "")).strip().lower() == clean:
                return str(r.get("Member ID", "")).strip()
        return ""

    # Only the first approver is used (the Workflow variable expects a single user ID)
    approver_id = get_slack_id(body.approvers[0]) if body.approvers else ""

    workflow_data = {
        "instructor_email":       user.email,
        "instructor_name":        user.name,
        "program":                body.program,
        "batch_name":             body.batch_name,
        "class_title":            body.class_title,
        "module_name":            body.module_name,
        "date_of_class":          body.date_of_class,
        "time_of_class":          body.time_of_class,
        "class_type":             body.class_type,
        "shift_other_classes":    body.shift_other_classes,
        "contest_impact":         body.contest_impact,
        "assignment_requirement": body.assignment_requirement,
        "reason":                 body.reason,
        "other_comments":         body.other_comments or "",
        "approver":               approver_id,
    }

    async def _send_addition():
        from app.slack import send_workflow_payload
        from app.config import settings
        await send_workflow_payload(settings.slack_class_addition_webhook, workflow_data)

    asyncio.create_task(_send_addition())

    await asyncio.to_thread(cache.force_refresh_requests)

    return {"message": "Class addition request submitted.", "request_id": request_id}


@router.get("/my-requests")
async def get_my_requests(user: UserInfo = Depends(get_current_user)):
    """Get status of all requests raised by the user."""
    # Lazy Init
    try:
        cache.ensure_initialized()
    except Exception:
        pass

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
