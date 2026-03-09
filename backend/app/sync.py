"""Background sync engine between Google Sheets and Supabase."""

import asyncio
import hashlib
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List

from app.sheets import (
    sheets_service,
    UPCOMING_CLASSES_SHEET,
    PAST_CLASSES_SHEET,
    SLACK_MEMBERS_SHEET,
    SLACK_GROUP_SHEET,
    UNAVAILABILITY_SHEET,
    CLASS_ADDITION_SHEET,
)
from app.supabase_client import supabase

logger = logging.getLogger(__name__)
IST = timezone(timedelta(hours=5, minutes=30))


def _generate_row_hash(row: Dict[str, Any]) -> str:
    """Generate a consistent hash from key class columns to identify uniqueness."""
    # We hash the combination of Instructor Email + Date + Time + Batch + Topic
    key_string = f"{row.get('instructor_email', '')}|{row.get('class_date', '')}|{row.get('time_of_day', '')}|{row.get('sb_names', '')}|{row.get('class_topic', '')}"
    return hashlib.md5(key_string.encode('utf-8')).hexdigest()


async def pull_classes():
    """Pull upcoming and past classes from Google Sheets and UPSERT into Supabase."""
    logger.info("Starting class pull from Google Sheets to Supabase...")
    
    # 1. Fetch data from sheets
    upcoming_data = await asyncio.to_thread(sheets_service.get_all_records, UPCOMING_CLASSES_SHEET)
    past_data = await asyncio.to_thread(sheets_service.get_all_records, PAST_CLASSES_SHEET)

    now_iso = datetime.now(IST).isoformat()
    records_to_upsert = []
    
    # Track hashes to later delete rows that no longer exist in the sheets (optional cleanup)
    active_hashes = set()

    # Process Upcoming
    for row in upcoming_data:
        # Standardize keys to lowercase with underscores based on typical sheet headers
        clean_row = {k.strip().lower().replace(' ', '_'): str(v).strip() for k, v in row.items()}
        
        row_hash = _generate_row_hash(clean_row)
        active_hashes.add(row_hash)
        
        records_to_upsert.append({
            "sbat_group_id": clean_row.get("sbat_group_id", ""),
            "instructor_email": clean_row.get("instructor_email", "").lower(),
            "instructor_name": clean_row.get("instructor_name", ""),
            "program": clean_row.get("program", ""),
            "sb_names": clean_row.get("sb_names", ""),
            "module_name": clean_row.get("module_name", ""),
            "class_topic": clean_row.get("class_topic", ""),
            "class_date": clean_row.get("class_date", ""),
            "time_of_day": clean_row.get("time_of_day", ""),
            "class_type": clean_row.get("class_type", ""),
            "class_rating": "", # Doesn't exist in upcoming
            "class_category": "upcoming",
            "sheet_row_hash": row_hash,
            "synced_at": now_iso
        })

    # Process Past
    for row in past_data:
        clean_row = {k.strip().lower().replace(' ', '_'): str(v).strip() for k, v in row.items()}
        
        row_hash = _generate_row_hash(clean_row)
        active_hashes.add(row_hash)
        
        records_to_upsert.append({
            "sbat_group_id": clean_row.get("sbat_group_id", ""),
            "instructor_email": clean_row.get("instructor_email", "").lower(),
            "instructor_name": clean_row.get("instructor_name", ""),
            "program": clean_row.get("program", ""),
            "sb_names": clean_row.get("sb_names", ""),
            "module_name": clean_row.get("module_name", ""),
            "class_topic": clean_row.get("class_topic", ""),
            "class_date": clean_row.get("class_date", ""),
            "time_of_day": clean_row.get("time_of_day", ""),
            "class_type": clean_row.get("class_type", ""),
            "class_rating": clean_row.get("class_rating", ""),
            "class_category": "past",
            "sheet_row_hash": row_hash,
            "synced_at": now_iso
        })

    # Execute batch upserts to Supabase in chunks of 500 to avoid payload limits
    chunk_size = 500
    for i in range(0, len(records_to_upsert), chunk_size):
        chunk = records_to_upsert[i:i + chunk_size]
        try:
            # Upsert requires a unique constraint on the column we are matching.
            # Assuming 'sheet_row_hash' is marked Unique in Supabase DB setting.
            supabase.table("classes").upsert(chunk, on_conflict="sheet_row_hash").execute()
            logger.info(f"Upserted classes chunk {i} to {i+len(chunk)}")
        except Exception as e:
            logger.error(f"Failed to upsert classes chunk: {e}")
            
    # Optional: Delete rows in Supabase that no longer exist in Google Sheets
    # (Leaving this out for safety unless strictly required, to prevent accidental mass deletion)


async def pull_slack_data():
    """Pull Slack configurations from Google Sheets to Supabase."""
    logger.info("Starting Slack sync...")
    
    # 1. Pull Members
    members = await asyncio.to_thread(sheets_service.get_all_records, SLACK_MEMBERS_SHEET)
    member_records = []
    for row in members:
        member_records.append({
            "id": str(row.get("id", "")).strip(),
            "email": str(row.get("email", "")).strip().lower(),
            "name": str(row.get("name", "")).strip()
        })
    if member_records:
        try:
            supabase.table("slack_members").upsert(member_records, on_conflict="id").execute()
        except Exception as e:
            logger.error(f"Failed to upsert slack_members: {e}")

    # 2. Pull Groups
    groups = await asyncio.to_thread(sheets_service.get_all_records, SLACK_GROUP_SHEET)
    group_records = []
    for row in groups:
        group_records.append({
            "usergroup_id": str(row.get("usergroup_id", "")).strip(),
            "handle": str(row.get("handle", "")).strip(),
            "name": str(row.get("name", "")).strip(),
            "tag": str(row.get("tag", "")).strip()
        })
    if group_records:
        try:
            supabase.table("slack_groups").upsert(group_records, on_conflict="usergroup_id").execute()
        except Exception as e:
            logger.error(f"Failed to upsert slack_groups: {e}")


async def push_requests():
    """Find requests in Supabase with pushed_to_sheet=False, append to Google Sheets, then mark True."""
    logger.info("Starting request push from Supabase to Google Sheets...")

    # 1. Handle Unavailability
    try:
        unavail = supabase.table("unavailability_requests").select("*").eq("pushed_to_sheet", False).execute()
        records = unavail.data or []
        for rec in records:
            row = [
                rec.get("instructor_email", ""),
                rec.get("instructor_name", ""),
                rec.get("program", ""),
                rec.get("batch_name", ""),
                rec.get("sbat_group_id", ""),
                rec.get("module_name", ""),
                rec.get("class_title", ""),
                rec.get("original_date_of_class", ""),
                rec.get("original_time_of_class", ""),
                rec.get("class_type", ""),
                rec.get("reason_for_unavailability", ""),
                rec.get("any_other_comments", ""),
                rec.get("suggested_instructors_for_replacement", ""),
                rec.get("topics_and_promises", ""),
                rec.get("batch_pulse_persona", ""),
                rec.get("recommended_teaching_pace", ""),
                rec.get("raised_timestamp", ""),
                rec.get("raised_by", ""),
                rec.get("slack_thread_link", ""),
                rec.get("final_status", ""),
                rec.get("replacement_instructor", ""),
                rec.get("class_rating_in_case_of_replacement", ""),
                rec.get("ri_taking_the_class", ""),
                rec.get("red_flag_proof", ""),
                rec.get("id", ""), # request_id
                rec.get("status", ""),
                rec.get("locked_by", ""),
                rec.get("locked_at", "")
            ]
            await asyncio.to_thread(sheets_service.append_row, UNAVAILABILITY_SHEET, row)
            supabase.table("unavailability_requests").update({"pushed_to_sheet": True}).eq("id", rec["id"]).execute()
            
    except Exception as e:
        logger.error(f"Failed pushing unavailability requests: {e}")

    # 2. Handle Class Additions
    try:
        class_add = supabase.table("class_addition_requests").select("*").eq("pushed_to_sheet", False).execute()
        records = class_add.data or []
        for rec in records:
            row = [
                rec.get("instructor_email", ""),
                rec.get("instructor_name", ""),
                rec.get("program", ""),
                rec.get("batch_name", ""),
                rec.get("class_title", ""),
                rec.get("module_name", ""),
                rec.get("date_of_class", ""),
                rec.get("time_of_class", ""),
                rec.get("class_type", ""),
                rec.get("shift_other_classes_by_1", ""),
                rec.get("contest_impact", ""),
                rec.get("assignment_requirement", ""),
                rec.get("reason_for_addition", ""),
                rec.get("other_comments", ""),
                rec.get("select_approver", ""),
                rec.get("submitted_by", ""),
                rec.get("time_stamp", ""),
                rec.get("slack_thread_link", ""),
                rec.get("actual_date_of_class", ""),
                rec.get("class_added_on_class_day", ""),
                rec.get("slack_link", ""),
                rec.get("red_flag", ""),
                rec.get("id", ""), # request_id
                rec.get("status", ""),
                rec.get("locked_by", ""),
                rec.get("locked_at", ""),
                rec.get("rejection_reason", "")
            ]
            await asyncio.to_thread(sheets_service.append_row, CLASS_ADDITION_SHEET, row)
            supabase.table("class_addition_requests").update({"pushed_to_sheet": True}).eq("id", rec["id"]).execute()
            
    except Exception as e:
        logger.error(f"Failed pushing class addition requests: {e}")


async def sync_deletions():
    """Remove rows from Google Sheets that no longer exist in Supabase."""
    logger.info("Starting deletion sync (Sheets cleanup)...")

    for table, sheet in [
        ("unavailability_requests", UNAVAILABILITY_SHEET),
        ("class_addition_requests", CLASS_ADDITION_SHEET),
    ]:
        try:
            # Get all IDs from Supabase
            res = supabase.table(table).select("id").execute()
            supabase_ids = {r["id"] for r in (res.data or [])}

            # Get all Request IDs from the Sheet (column where ID is stored)
            # First, find the column index for Request ID / id
            headers = await asyncio.to_thread(sheets_service.get_header_indices, sheet)
            # The request ID column could be labeled "Request ID" or be the last meaningful column
            id_col = headers.get("Request ID") or headers.get("request_id")
            if not id_col:
                logger.warning(f"Could not find Request ID column in '{sheet}', skipping deletion sync.")
                continue

            worksheet = await asyncio.to_thread(lambda: sheets_service.spreadsheet.worksheet(sheet))
            col_values = await asyncio.to_thread(worksheet.col_values, id_col)

            # Find rows to delete (skip header row at index 0)
            rows_to_delete = []
            for i, val in enumerate(col_values):
                if i == 0:  # skip header
                    continue
                val = str(val).strip()
                if val and val not in supabase_ids:
                    rows_to_delete.append(i + 1)  # 1-indexed row number

            # Delete in reverse order so row indices don't shift
            for row_num in reversed(rows_to_delete):
                try:
                    await asyncio.to_thread(sheets_service.delete_row, sheet, row_num)
                    logger.info(f"Deleted orphaned row {row_num} from '{sheet}'")
                except Exception as e:
                    logger.warning(f"Failed to delete row {row_num} from '{sheet}': {e}")

            if rows_to_delete:
                logger.info(f"Cleaned up {len(rows_to_delete)} orphaned row(s) from '{sheet}'")

        except Exception as e:
            logger.error(f"Deletion sync failed for '{sheet}': {e}")


async def run_full_sync():
    """Runs the complete Sync Engine combining Pulls and Pushes securely."""
    logger.info("--- SYNC ENGINE STARTED ---")
    await pull_classes()
    await pull_slack_data()
    await push_requests()
    await sync_deletions()
    logger.info("--- SYNC ENGINE COMPLETED ---")
