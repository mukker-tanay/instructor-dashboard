"""Policies endpoints — list, add, and delete policy PDFs stored in Google Sheets."""

import asyncio
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.dependencies import get_current_user, require_admin
from app.models import UserInfo
from app.sheets import sheets_service, POLICIES_SHEET

router = APIRouter(prefix="/api/policies", tags=["policies"])

# Expected sheet columns: Name | URL | Description | Category | Added By | Added At
POLICY_HEADERS = ["Name", "URL", "Description", "Category", "Added By", "Added At"]


class PolicyCreate(BaseModel):
    name: str
    url: str
    description: str = ""
    category: str = ""


def _ensure_sheet() -> None:
    """Create the Policies sheet with headers if it doesn't exist yet."""
    try:
        sp = sheets_service.spreadsheet
        try:
            sp.worksheet(POLICIES_SHEET)
        except Exception:
            ws = sp.add_worksheet(title=POLICIES_SHEET, rows=1000, cols=10)
            ws.append_row(POLICY_HEADERS, value_input_option="USER_ENTERED")
    except Exception:
        pass  # degraded mode — sheet unavailable


@router.get("")
async def list_policies(user: UserInfo = Depends(get_current_user)):
    """Return all policies (available to all authenticated users)."""
    try:
        records = await asyncio.to_thread(sheets_service.get_all_records, POLICIES_SHEET)
        # Attach a 1-based data row index (header = row 1, first data row = row 2)
        policies = []
        for i, r in enumerate(records, start=2):
            policies.append({
                "row": i,
                "name": str(r.get("Name", "")).strip(),
                "url": str(r.get("URL", "")).strip(),
                "description": str(r.get("Description", "")).strip(),
                "category": str(r.get("Category", "")).strip(),
                "added_by": str(r.get("Added By", "")).strip(),
                "added_at": str(r.get("Added At", "")).strip(),
            })
        return {"policies": policies, "total": len(policies)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def add_policy(body: PolicyCreate, admin: UserInfo = Depends(require_admin)):
    """Add a new policy entry (admin only)."""
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Policy name is required.")
    if not body.url.strip():
        raise HTTPException(status_code=400, detail="Policy URL is required.")
    try:
        await asyncio.to_thread(_ensure_sheet)
        now = datetime.now().strftime("%m/%d/%Y %I:%M %p")
        row = [
            body.name.strip(),
            body.url.strip(),
            body.description.strip(),
            body.category.strip(),
            admin.email,
            now,
        ]
        await asyncio.to_thread(sheets_service.append_row, POLICIES_SHEET, row)
        return {"message": "Policy added successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{row_index}")
async def delete_policy(row_index: int, admin: UserInfo = Depends(require_admin)):
    """Delete a policy row by its sheet row number (admin only)."""
    if row_index < 2:
        raise HTTPException(status_code=400, detail="Invalid row index.")
    try:
        await asyncio.to_thread(sheets_service.delete_row, POLICIES_SHEET, row_index)
        return {"message": "Policy deleted successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
