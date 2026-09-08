"""Router for fetching system logs."""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from app.dependencies import require_admin
from app.models import UserInfo
from app.supabase_client import supabase

router = APIRouter(prefix="/api/logs", tags=["Logs"])

@router.get("")
async def get_system_logs(
    level: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(100, le=1000),
    user: UserInfo = Depends(require_admin)
):
    """Fetch system logs (Admin only)."""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client not initialized")
        
    try:
        query = supabase.table("system_logs").select("*").order("timestamp", desc=True).limit(limit)
        
        if level:
            query = query.eq("level", level)
            
        if search:
            # Use .or() to search message or logger_name
            # ilike performs case-insensitive search
            search_pattern = f"%{search}%"
            query = query.or_(f"message.ilike.{search_pattern},logger_name.ilike.{search_pattern}")
            
        result = query.execute()
        return result.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
