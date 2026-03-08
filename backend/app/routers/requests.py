"""Instructor request endpoints - unavailability and class addition."""

import uuid
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_current_user
from app.models import (
    UserInfo,
    UnavailabilityRequestCreate,
    ClassAdditionRequestCreate,
)
from app.supabase_client import supabase
from app.sheets import sheets_service, UNAVAILABILITY_SHEET, CLASS_ADDITION_SHEET
from app.slack import fire_slack_notification, send_workflow_payload
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["requests"])

IST = timezone(timedelta(hours=5, minutes=30))

def _check_duplicate_unavailability(email: str, batch: str, class_title: str, date_str: str) -> None:
    """Block if an active (Pending) unavailability request already exists for the same class."""
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
        print(f"[ERROR] Failed duplicate check Supabase: {e}")


def _check_duplicate_class_addition(email: str, batch: str, date_str: str, time_str: str) -> None:
    """Block if an active (Pending) class addition request exists for the same batch+date+time."""
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
        print(f"[ERROR] Failed duplicate class addition check Supabase: {e}")


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
        now_dt = datetime.now(IST)
        now = now_dt.strftime("%m/%d/%Y %I:%M %p")

        supabase_record = {
            "id": request_id,
            "instructor_email": user.email,
            "instructor_name": user.name,
            "program": cls.get("program", ""),
            "batch_name": cls.get("batch_name", cls.get("sb_names", "")),
            "sbat_group_id": cls.get("sbat_group_id", ""),
            "module_name": cls.get("module_name", ""),
            "class_title": cls.get("class_title", cls.get("class_topic", "")),
            "original_date_of_class": date_str,
            "original_time_of_class": time_str,
            "class_type": cls.get("class_type", ""),
            "reason_for_unavailability": body.reason,
            "any_other_comments": body.other_comments or "",
            "suggested_instructors_for_replacement": body.suggested_replacement or "",
            "topics_and_promises": body.topics_and_promises,
            "batch_pulse_persona": body.batch_pulse_persona,
            "recommended_teaching_pace": body.teaching_pace_style,
            "raised_timestamp": now_dt.isoformat(),
            "raised_by": user.email,
            "slack_thread_link": "",
            "final_status": "",
            "replacement_instructor": "",
            "class_rating_in_case_of_replacement": "",
            "ri_taking_the_class": "",
            "red_flag_proof": "",
            "status": "Pending",
            "locked_by": "",
            "locked_at": None,
            "pushed_to_sheet": False
        }

        try:
            supabase.table("unavailability_requests").insert(supabase_record).execute()
            results.append({"request_id": request_id, "class": cls.get("class_title", cls.get("class_topic", ""))})
        except Exception as e:
            logger.error(f"Failed to insert unavailability request into Supabase: {e}")
            raise HTTPException(status_code=500, detail="Database insertion failed")

        # --- Slack Workflow Notification ---
        batch_name  = cls.get('batch_name', cls.get('sb_names', ''))
        program     = cls.get('program', '')
        sbat        = cls.get('sbat_group_id', '')
        module      = cls.get('module_name', '')
        class_title = cls.get('class_title', cls.get('class_topic', ''))
        class_type  = cls.get('class_type', '')

        # Look up Slack user ID for suggested replacement from Supabase
        def get_slack_id(name: str) -> str:
            if not name:
                return ""
            try:
                res = supabase.table("slack_members").select("id").ilike("name", name.strip()).limit(1).execute()
                if res.data:
                    return str(res.data[0].get("id", "")).strip()
            except Exception as e:
                print(f"[ERROR] Slack member lookup failed: {e}")
            return ""

        slack_id = get_slack_id(body.suggested_replacement or "")
        print(f"[DEBUG] Suggested replacement: name='{body.suggested_replacement}' -> slack_id='{slack_id}'")

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
            "suggested_replacement": slack_id,
            "topics_and_promises":   body.topics_and_promises,
            "batch_pulse_persona":   body.batch_pulse_persona,
            "teaching_pace_style":   body.teaching_pace_style,
        }

        # Send Slack Workflow notification (awaited to ensure it fires on Vercel serverless)
        await send_workflow_payload(settings.slack_unavailability_webhook, workflow_data)

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
    now_dt = datetime.now(IST)
    now = now_dt.strftime("%m/%d/%Y %I:%M %p")

    supabase_record = {
        "id": request_id,
        "instructor_email": user.email,
        "instructor_name": user.name,
        "program": body.program,
        "batch_name": body.batch_name,
        "class_title": body.class_title,
        "module_name": body.module_name,
        "date_of_class": body.date_of_class,
        "time_of_class": body.time_of_class,
        "class_type": body.class_type,
        "shift_other_classes_by_1": body.shift_other_classes,
        "contest_impact": body.contest_impact,
        "assignment_requirement": body.assignment_requirement,
        "reason_for_addition": body.reason,
        "other_comments": body.other_comments or "",
        "select_approver": body.approver,
        "submitted_by": user.email,
        "time_stamp": now_dt.isoformat(),
        "slack_thread_link": "",
        "actual_date_of_class": "",
        "class_added_on_class_day": "",
        "slack_link": "",
        "red_flag": "",
        "status": "Pending",
        "locked_by": "",
        "locked_at": None,
        "rejection_reason": "",
        "pushed_to_sheet": False
    }

    try:
        supabase.table("class_addition_requests").insert(supabase_record).execute()
    except Exception as e:
        logger.error(f"Failed to insert class addition request into Supabase: {e}")
        raise HTTPException(status_code=500, detail="Database insertion failed")

    # --- Slack Workflow Notification ---
    # Look up approver Slack ID from Supabase
    def get_slack_id(name: str) -> str:
        if not name:
            return ""
        try:
            res = supabase.table("slack_members").select("id").ilike("name", name.strip()).limit(1).execute()
            if res.data:
                return str(res.data[0].get("id", "")).strip()
        except Exception as e:
            print(f"[ERROR] Slack member lookup failed: {e}")
        return ""

    # Only the first approver is used (the Workflow variable expects a single user ID)
    approver_id = get_slack_id(body.approver) if body.approver else ""

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

    # Send Slack Workflow notification (awaited to ensure it fires on Vercel serverless)
    await send_workflow_payload(settings.slack_class_addition_webhook, workflow_data)

    return {"message": "Class addition request submitted.", "request_id": request_id}


@router.get("/my-requests")
async def get_my_requests(user: UserInfo = Depends(get_current_user)):
    """Get status of all requests raised by the user from Supabase."""
    email = user.email.lower()
    unavailability = []
    additions = []

    try:
        res = supabase.table("unavailability_requests").select("*").eq("instructor_email", email).order("raised_timestamp", desc=True).execute()
        for r in (res.data or []):
            # Add frontend-compatible aliases (old Google Sheets header names)
            r["Class Title"] = r.get("class_title", "")
            r["Module Name"] = r.get("module_name", "")
            r["Batch Name"] = r.get("batch_name", "")
            r["Original Date of Class (MM/DD/YYYY)"] = r.get("original_date_of_class", "")
            r["Original Time of Class (HH:MM AM/PM) IST"] = r.get("original_time_of_class", "")
            r["Raised Timestamp"] = r.get("raised_timestamp", "")
            r["Reason for Unavailability"] = r.get("reason_for_unavailability", "")
            r["Status"] = r.get("status", "Pending")
            unavailability.append({**r, "request_type": "unavailability"})
    except Exception as e:
        print(f"[ERROR] Failed to fetch unavailability requests: {e}")

    try:
        res = supabase.table("class_addition_requests").select("*").eq("instructor_email", email).order("time_stamp", desc=True).execute()
        for r in (res.data or []):
            # Add frontend-compatible aliases
            r["Class Title"] = r.get("class_title", "")
            r["Module Name"] = r.get("module_name", "")
            r["Batch Name"] = r.get("batch_name", "")
            r["Date of Class (MM/DD/YYYY)"] = r.get("date_of_class", "")
            r["Time of Class (HH:MM AM/PM) IST"] = r.get("time_of_class", "")
            r["Time stamp"] = r.get("time_stamp", "")
            r["Reason for Addition of Class"] = r.get("reason_for_addition", "")
            r["Status"] = r.get("status", "Pending")
            additions.append({**r, "request_type": "class_addition"})
    except Exception as e:
        print(f"[ERROR] Failed to fetch class addition requests: {e}")

    all_requests = unavailability + additions
    all_requests.sort(key=lambda r: str(r.get("raised_timestamp") or r.get("time_stamp") or ""), reverse=True)

    return {"requests": all_requests, "total": len(all_requests)}
