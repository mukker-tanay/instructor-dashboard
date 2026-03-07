import sys
import re

file_path = "backend/app/routers/requests.py"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 3. /unavailability-requests POST Replacement
old_unavail_post = """        request_id = str(uuid.uuid4())
        now = datetime.now(IST).strftime("%m/%d/%Y %I:%M %p")

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

        rows_to_append.append(row)
        await asyncio.to_thread(sheets_service.append_row, UNAVAILABILITY_SHEET, row)
        results.append({"request_id": request_id, "class": cls.get("class_title", cls.get("class_topic", ""))})"""

new_unavail_post = """        request_id = str(uuid.uuid4())
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
            raise HTTPException(status_code=500, detail="Database insertion failed")"""
            
content = content.replace(old_unavail_post, new_unavail_post)

# 4. Remove entirely the "Optimistic Cache Update" block for unavailability
old_optimistic_u = """    # â”€â”€â”€ Optimistic Cache Update â”€â”€â”€
    # Instead of blocking on a full sheet read, inject the new rows into the in-memory cache directly
    try:
        headers_map = await asyncio.to_thread(sheets_service.get_header_indices, UNAVAILABILITY_SHEET)
        sorted_headers = sorted(headers_map.items(), key=lambda x: x[1])
        
        for row_data in rows_to_append:
            cache_row = {}
            for i, (col_name, col_idx) in enumerate(sorted_headers):
                cache_row[col_name] = row_data[i] if i < len(row_data) else ""
            cache.unavailability_requests.insert(0, cache_row)
    except Exception as e:
        logger.error(f"Optimistic cache update failed for unavailability: {e}")
        # Fallback to background refresh if optimistic update fails
        asyncio.get_running_loop().create_task(asyncio.to_thread(cache.force_refresh_requests))"""

content = content.replace(old_optimistic_u, "")


# 5. /class-addition-requests POST Replacement
old_classadd_post = """    request_id = str(uuid.uuid4())
    now = datetime.now(IST).strftime("%m/%d/%Y %I:%M %p")

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

    await asyncio.to_thread(sheets_service.append_row, CLASS_ADDITION_SHEET, row)"""

new_classadd_post = """    request_id = str(uuid.uuid4())
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
        raise HTTPException(status_code=500, detail="Database insertion failed")"""

content = content.replace(old_classadd_post, new_classadd_post)

# 6. Remove Optimistic Cache for class additions
old_optimist_c = """    # â”€â”€â”€ Optimistic Cache Update â”€â”€â”€
    try:
        headers_map = await asyncio.to_thread(sheets_service.get_header_indices, CLASS_ADDITION_SHEET)
        sorted_headers = sorted(headers_map.items(), key=lambda x: x[1])
        
        cache_row = {}
        for i, (col_name, col_idx) in enumerate(sorted_headers):
            cache_row[col_name] = row[i] if i < len(row) else ""
        cache.class_addition_requests.insert(0, cache_row)
    except Exception as e:
        logger.error(f"Optimistic cache update failed for class addition: {e}")
        asyncio.get_running_loop().create_task(asyncio.to_thread(cache.force_refresh_requests))"""

content = content.replace(old_optimist_c, "")

import builtins
with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("done rewriting requests.py payload")
