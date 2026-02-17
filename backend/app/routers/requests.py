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

        slack_msg = (
            f"*Instructor Email*\n{user.email}\n"
            f"*Instructor Name*\n{user.name}\n"
            f"*Program*\n{program}\n"
            f"*Batch Name*\n{batch_name}\n"
            f"*SBAT Group ID*\n{sbat}\n"
            f"*Class Title*\n{class_title}\n"
            f"*Module Name*\n{module}\n"
            f"*Original Date of Class (MM/DD/YYYY)*\n{date_str}\n"
            f"*Original Time of Class (HH:MM AM/PM) IST*\n{time_str}\n"
            f"*Class Type*\n{class_type}\n"
            f"*Reason for Unavailability*\n{body.reason}\n"
            f"*Any other Comments*\n{body.other_comments or ''}\n"
            f"*Suggested Instructors for Replacement*\n{body.suggested_replacement or ''}\n"
            f"*Topics & Promises From Previous Class*\n{body.topics_and_promises}\n"
            f"*Batch Pulse & Persona*\n{body.batch_pulse_persona}\n"
            f"*Recommended Teaching Pace & Style*\n{body.teaching_pace_style}"
        )

        # Fetch batch metrics and append to the message
        try:
            metrics = await asyncio.to_thread(sheets_service.get_batch_metrics, str(batch_name))
            if metrics:
                ri_count = metrics.get("No of RI's allocated", "N/A")
                ri_names = metrics.get("RI's Allocated", "N/A")
                slack_msg += (
                    f"\n\n*Batch Metrics:*\n"
                    f"*Current Module*\n{metrics.get('Current Module', 'N/A')}\n"
                    f"*Batch NPS*\n{metrics.get('Batch NPS', 'N/A')}\n"
                    f"*Reschedules in this module*\n{metrics.get('Reschedules in this module', 'N/A')}\n"
                    f"*No of break class days*\n{metrics.get('No of break class days', 'N/A')}\n"
                    f"*No of RI's allocated*\n{ri_count}\n"
                    f"*RI's Allocated*\n{ri_names}"
                )
        except Exception:
            pass  # Don't block request creation if metrics fetch fails

        fire_slack_notification(slack_msg)

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
    # Instructor Email, Instructor Name, Program, Batch Name, Class Title,
    # Module Name, Date of Class (MM/DD/YYYY), Time of Class (HH:MM AM/PM) IST,
    # Class Type (Regular/Optional), Shift other Classes by 1(Yes/No),
    # Will this addition affect the live contest date?(Yes/No/Not Aware),
    # Requirement of Assignment & Homework(...), Reason for Addition of Class,
    # Other Comments, Select Approver, Submitted by, Time stamp,
    # Slack Thread Link, Actual Date of Class,
    # Class Added on Class Day/Non-Class Day Sanctioned/Non-Sanctioned,
    # Slack Link, Red Flag, request_id, status, locked_by, locked_at
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
        body.approver,                  # Select Approver
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

    slack_msg = (
        f"*Class Addition Request*\n"
        f"*Instructor Email*\n{user.email}\n"
        f"*Instructor Name*\n{user.name}\n"
        f"*Program*\n{body.program}\n"
        f"*Batch Name*\n{body.batch_name}\n"
        f"*Class Title*\n{body.class_title}\n"
        f"*Module Name*\n{body.module_name}\n"
        f"*Date of Class (MM/DD/YYYY)*\n{body.date_of_class}\n"
        f"*Time of Class (HH:MM AM/PM) IST*\n{body.time_of_class}\n"
        f"*Class Type*\n{body.class_type}\n"
        f"*Shift other Classes by 1*\n{body.shift_other_classes}\n"
        f"*Will this addition affect the live contest date?*\n{body.contest_impact}\n"
        f"*Requirement of Assignment & Homework*\n{body.assignment_requirement}\n"
        f"*Reason for Addition of Class*\n{body.reason}\n"
        f"*Other Comments*\n{body.other_comments or ''}\n"
        f"*Select Approver*\n{body.approver}"
    )

    fire_slack_notification(slack_msg)

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
