import asyncio
import logging
import uuid
from datetime import datetime, timezone, timedelta

from app.config import settings
from app.sheets import sheets_service, UNAVAILABILITY_SHEET, CLASS_ADDITION_SHEET
from app.supabase_client import supabase

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)

async def migrate_historical():
    logger.info("Starting historical request migration...")
    
    # 1. Unavailability Requests
    logger.info("Pulling Unavailability Requests...")
    unavail_data = await asyncio.to_thread(sheets_service.get_all_records, UNAVAILABILITY_SHEET)
    
    unavail_records = []
    for row in unavail_data:
        unavail_records.append({
            "id": str(row.get("request_id") or uuid.uuid4()),
            "instructor_email": str(row.get("Instructor Email", "")).lower().strip(),
            "instructor_name": str(row.get("Instructor Name", "")),
            "program": str(row.get("Program", "")),
            "batch_name": str(row.get("Batch Name", "")),
            "sbat_group_id": str(row.get("SBAT Group ID", "")),
            "module_name": str(row.get("Module Name", "")),
            "class_title": str(row.get("Class Title", "")),
            "original_date_of_class": str(row.get("Original Date of Class (MM/DD/YYYY)", "")),
            "original_time_of_class": str(row.get("Original Time of Class (HH:MM AM/PM) IST", "")),
            "class_type": str(row.get("Class Type", "")),
            "reason_for_unavailability": str(row.get("Reason for Unavailability", "")),
            "any_other_comments": str(row.get("Any Other Comments", "")),
            "suggested_instructors_for_replacement": str(row.get("Suggested Instructors for Replacement", "")),
            "topics_and_promises": str(row.get("Topics & Promises from Previous Class", "")),
            "batch_pulse_persona": str(row.get("Batch Pulse & Persona", "")),
            "recommended_teaching_pace": str(row.get("Recommended Teaching Pace & Style", "")),
            "raised_timestamp": str(row.get("Raised Timestamp", "")),
            "raised_by": str(row.get("Raised By", "")),
            "slack_thread_link": str(row.get("Slack Thread Link", "")),
            "final_status": str(row.get("Final status (Instructor change/ Reschedule to a class day/ Reschedule to a non-class day)", "")),
            "replacement_instructor": str(row.get("Replacement Instructor", "")),
            "class_rating_in_case_of_replacement": str(row.get("Class rating in case of replacement", "")),
            "ri_taking_the_class": str(row.get("If request has to be considered for red flag exception, please drop RI taking the class & screenshot proof's drive link.", "")),
            "red_flag_proof": str(row.get("If request has to be considered for red flag exception, please drop RI taking the class & screenshot proof's drive link.", "")), # Using same field for now as previous backend logic often merged this
            "status": str(row.get("status") or "Pending"),
            "locked_by": str(row.get("locked_by", "")),
            "locked_at": str(row.get("locked_at", "")) if row.get("locked_at") else None,
            "pushed_to_sheet": True
        })
        
    if unavail_records:
        try:
            supabase.table("unavailability_requests").upsert(unavail_records, on_conflict="id").execute()
            logger.info(f"Successfully migrated {len(unavail_records)} historical Unavailability requests to Supabase.")
        except Exception as e:
            logger.error(f"Failed to migrate Unavailability requests: {e}")

    # 2. Class Addition Requests
    logger.info("Pulling Class Addition Requests...")
    class_add_data = await asyncio.to_thread(sheets_service.get_all_records, CLASS_ADDITION_SHEET)
    
    class_add_records = []
    for row in class_add_data:
        class_add_records.append({
            "id": str(row.get("request_id") or uuid.uuid4()),
            "instructor_email": str(row.get("Instructor Email", "")).lower().strip(),
            "instructor_name": str(row.get("Instructor Name", "")),
            "program": str(row.get("Program", "")),
            "batch_name": str(row.get("Batch", "")),
            "class_title": str(row.get("Class Title", "")),
            "module_name": str(row.get("Module Name", "")),
            "date_of_class": str(row.get("Date of Class", "")),
            "time_of_class": str(row.get("Time of Class", "")),
            "class_type": str(row.get("Class Type", "")),
            "shift_other_classes_by_1": str(row.get("Does it shift other classes by 1?", "")),
            "contest_impact": str(row.get("Impact on contest?", "")),
            "assignment_requirement": str(row.get("Requirement of assignment and notes mapped to particular class?", "")),
            "reason_for_addition": str(row.get("Reason for class addition", "")),
            "other_comments": str(row.get("Any other comments?", "")),
            "select_approver": str(row.get("Select Approver", "")),
            "submitted_by": str(row.get("Submitted by", "")),
            "time_stamp": str(row.get("Time stamp", "")),
            "slack_thread_link": str(row.get("Slack Thread Link", "")),
            "actual_date_of_class": str(row.get("Actual date of class", "")),
            "class_added_on_class_day": str(row.get("Class added on Class day/ Non Class Day", "")),
            "slack_link": str(row.get("Slack link", "")),
            "red_flag": str(row.get("Red flag?", "")),
            "status": str(row.get("status") or "Pending"),
            "locked_by": str(row.get("locked_by", "")),
            "locked_at": str(row.get("locked_at", "")) if row.get("locked_at") else None,
            "rejection_reason": str(row.get("Rejection Reason (if rejected)", "")),
            "pushed_to_sheet": True
        })
        
    if class_add_records:
        try:
            supabase.table("class_addition_requests").upsert(class_add_records, on_conflict="id").execute()
            logger.info(f"Successfully migrated {len(class_add_records)} historical Class Addition requests to Supabase.")
        except Exception as e:
            logger.error(f"Failed to migrate Class Addition requests: {e}")
            
asyncio.run(migrate_historical())
