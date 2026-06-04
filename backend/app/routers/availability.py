"""Availability API router — manage instructor backup standby slots and slot preferences."""

import logging
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel, Field

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_current_user, require_admin
from app.models import UserInfo
from app.supabase_client import supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/availability", tags=["availability"])


# --- Schemas ---

class StandbyCreate(BaseModel):
    start_date: str = Field(..., description="YYYY-MM-DD")
    end_date: str = Field(..., description="YYYY-MM-DD")
    slot: str = Field(..., description="morning, evening, or both")
    notes: Optional[str] = ""


class PreferenceUpdate(BaseModel):
    general_preference: str = Field(..., description="morning, evening, both, or none")
    notes: Optional[str] = ""


# --- Endpoints ---

@router.get("/me")
async def get_my_availability(user: UserInfo = Depends(get_current_user)):
    """Fetch slot preferences and active/upcoming standby slots for the current instructor."""
    email = user.email.lower()
    
    try:
        # Get slot preferences
        pref_res = supabase.table("instructor_slot_preferences").select("*").eq("instructor_email", email).execute()
        pref = pref_res.data[0] if pref_res.data else {
            "instructor_email": email,
            "general_preference": "none",
            "notes": ""
        }
        
        # Get active/upcoming standby slots (start_date >= today or end_date >= today)
        today_str = datetime.now().strftime("%Y-%m-%d")
        standby_res = supabase.table("backup_availability").select("*").eq("instructor_email", email).gte("end_date", today_str).order("start_date").execute()
        
        return {
            "preferences": pref,
            "standby_slots": standby_res.data or []
        }
    except Exception as e:
        logger.error(f"Failed to fetch availability for {email}: {e}")
        raise HTTPException(status_code=500, detail="Database lookup failed")


@router.post("/standby")
async def add_standby_slot(body: StandbyCreate, user: UserInfo = Depends(get_current_user)):
    """Add or update a backup standby slot.

    Re-opting for the same calendar day (same start_date and end_date) updates the
    existing active row instead of creating a duplicate.
    """
    email = user.email.lower()
    start_str = body.start_date.strip()
    end_str = body.end_date.strip()

    # Validation
    try:
        start = datetime.strptime(start_str, "%Y-%m-%d")
        end = datetime.strptime(end_str, "%Y-%m-%d")
        if start > end:
            raise HTTPException(status_code=400, detail="Start date must be on or before end date")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Expected YYYY-MM-DD")

    slot_val = body.slot.strip().lower()
    if slot_val not in ["morning", "evening", "both"]:
        raise HTTPException(status_code=400, detail="Slot must be 'morning', 'evening', or 'both'")

    notes_val = body.notes.strip() if body.notes else ""

    try:
        # Same-day opt-in: upsert (one active row per instructor per date)
        if start_str == end_str:
            existing_res = (
                supabase.table("backup_availability")
                .select("*")
                .eq("instructor_email", email)
                .eq("start_date", start_str)
                .eq("end_date", end_str)
                .eq("status", "active")
                .execute()
            )
            existing = existing_res.data or []

            if existing:
                if any(row.get("status") == "assigned" for row in existing):
                    raise HTTPException(
                        status_code=400,
                        detail="This standby date is already assigned to a class and cannot be changed.",
                    )

                primary = existing[0]
                update_payload = {
                    "slot": slot_val,
                    "notes": notes_val,
                }
                updated_res = (
                    supabase.table("backup_availability")
                    .update(update_payload)
                    .eq("id", primary["id"])
                    .execute()
                )
                if not updated_res.data:
                    raise HTTPException(status_code=500, detail="Failed to update standby slot")

                # Remove duplicate rows for the same day (legacy double-submits)
                for dup in existing[1:]:
                    supabase.table("backup_availability").delete().eq("id", dup["id"]).execute()

                row = updated_res.data[0]
                return {
                    "message": "Backup standby slot updated successfully",
                    "updated": True,
                    "data": row,
                }

        payload = {
            "instructor_email": email,
            "start_date": start_str,
            "end_date": end_str,
            "slot": slot_val,
            "notes": notes_val,
            "status": "active",
        }
        res = supabase.table("backup_availability").insert(payload).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to insert standby slot")
        return {
            "message": "Backup standby slot created successfully",
            "updated": False,
            "data": res.data[0],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create standby slot for {email}: {e}")
        raise HTTPException(status_code=500, detail="Failed to save standby slot")


@router.delete("/standby/{slot_id}")
async def delete_standby_slot(slot_id: str, user: UserInfo = Depends(get_current_user)):
    """Delete a standby slot. Instructors can only delete their own slots unless admin."""
    email = user.email.lower()
    
    try:
        # Check ownership
        res_check = supabase.table("backup_availability").select("instructor_email").eq("id", slot_id).execute()
        if not res_check.data:
            raise HTTPException(status_code=404, detail="Standby slot not found")
            
        row = res_check.data[0]
        owner = row.get("instructor_email", "").lower()
        if owner != email and user.role != "admin":
            raise HTTPException(status_code=403, detail="Not authorized to delete this slot")

        start_d = row.get("start_date")
        end_d = row.get("end_date")
        # Remove all active rows for this day (cleans legacy duplicates)
        if start_d and end_d and start_d == end_d:
            supabase.table("backup_availability").delete().eq(
                "instructor_email", owner
            ).eq("start_date", start_d).eq("end_date", end_d).eq("status", "active").execute()
        else:
            supabase.table("backup_availability").delete().eq("id", slot_id).execute()
        return {"message": "Backup standby slot deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete standby slot {slot_id} for {email}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete standby slot")


@router.put("/preferences")
async def update_preferences(body: PreferenceUpdate, user: UserInfo = Depends(get_current_user)):
    """Upsert general weekly availability preferences for the current instructor."""
    email = user.email.lower()
    
    pref_val = body.general_preference.strip().lower()
    if pref_val not in ["morning", "evening", "both", "none"]:
        raise HTTPException(status_code=400, detail="Preference must be 'morning', 'evening', 'both', or 'none'")
        
    payload = {
        "instructor_email": email,
        "general_preference": pref_val,
        "notes": body.notes.strip() if body.notes else "",
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    try:
        res = supabase.table("instructor_slot_preferences").upsert(payload).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to save preferences")
        return {"message": "Weekly preferences updated successfully", "data": res.data[0]}
    except Exception as e:
        logger.error(f"Failed to update preferences for {email}: {e}")
        raise HTTPException(status_code=500, detail="Failed to save preferences")


@router.get("/admin/all")
async def get_all_availability(admin: UserInfo = Depends(require_admin)):
    """Admin-only: Retrieve all standby slots and weekly preferences."""
    try:
        # Get active/upcoming standbys
        today_str = datetime.now().strftime("%Y-%m-%d")
        standby_res = supabase.table("backup_availability").select("*").gte("end_date", today_str).order("start_date").execute()
        
        # Get all preferences
        pref_res = supabase.table("instructor_slot_preferences").select("*").execute()
        
        return {
            "preferences": pref_res.data or [],
            "standby_slots": standby_res.data or []
        }
    except Exception as e:
        logger.error(f"Admin failed to fetch all availability data: {e}")
        raise HTTPException(status_code=500, detail="Database lookup failed")
