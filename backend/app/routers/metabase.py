"""Metabase Queries endpoints — list, add, and delete query links stored in Supabase."""

import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.dependencies import get_current_user, require_admin
from app.models import UserInfo
from app.supabase_client import supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/metabase", tags=["metabase"])

IST = timezone(timedelta(hours=5, minutes=30))


class MetabaseQueryCreate(BaseModel):
    title: str
    url: str
    description: str = ""


@router.get("")
async def list_metabase_queries(user: UserInfo = Depends(get_current_user)):
    """Return all saved Metabase query links (available to all authenticated users)."""
    try:
        res = supabase.table("metabase_queries").select("*").order("created_at", desc=False).execute()
        return {"queries": res.data or [], "total": len(res.data or [])}
    except Exception as e:
        logger.error(f"Failed to fetch metabase queries: {e}")
        raise HTTPException(status_code=500, detail="Failed to load Metabase queries.")


@router.post("", status_code=201)
async def add_metabase_query(body: MetabaseQueryCreate, admin: UserInfo = Depends(require_admin)):
    """Add a new Metabase query link (admin only)."""
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="Title is required.")
    if not body.url.strip():
        raise HTTPException(status_code=400, detail="URL is required.")

    record = {
        "id": str(uuid.uuid4()),
        "title": body.title.strip(),
        "url": body.url.strip(),
        "description": body.description.strip(),
        "added_by": admin.email,
        "created_at": datetime.now(IST).isoformat(),
    }

    try:
        supabase.table("metabase_queries").insert(record).execute()
        return {"message": "Query added successfully."}
    except Exception as e:
        logger.error(f"Failed to insert metabase query: {e}")
        raise HTTPException(status_code=500, detail="Failed to add query.")


@router.delete("/{query_id}")
async def delete_metabase_query(query_id: str, admin: UserInfo = Depends(require_admin)):
    """Delete a Metabase query link by ID (admin only)."""
    try:
        supabase.table("metabase_queries").delete().eq("id", query_id).execute()
        return {"message": "Query deleted successfully."}
    except Exception as e:
        logger.error(f"Failed to delete metabase query {query_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete query.")
