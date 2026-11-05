"""NPS survey submission — appends straight into this month's NPS
spreadsheet's "nps_responses" tab via the service account, instead of
posting to a Google Form (see app/sheets.py append_nps_response)."""

import asyncio
from datetime import datetime
from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.dependencies import get_current_user
from app.models import UserInfo
from app.sheets import sheets_service

router = APIRouter(prefix="/api/nps", tags=["nps"])


class NpsSubmission(BaseModel):
    rating: int
    segment: Literal["detractor", "passive", "promoter"]
    challenges: List[str] = []
    challenges_other: str = ""
    follow_up: str = ""
    details: str = ""
    improve: List[str] = []
    improve_other: str = ""
    one_thing: str = ""
    value_most: List[str] = []
    value_most_other: str = ""
    continue_doing: str = ""
    promoter_improve: str = ""


@router.post("/submit")
async def submit_nps(body: NpsSubmission, user: UserInfo = Depends(get_current_user)):
    if not user.nps_eligible:
        raise HTTPException(status_code=403, detail="Not eligible for the NPS survey this month.")
    if not (1 <= body.rating <= 10):
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 10.")

    row = {
        "Timestamp": datetime.now().strftime("%m/%d/%Y %I:%M %p"),
        "Email": user.email,
        "Rating": body.rating,
        "Segment": body.segment,
        "Challenges": ", ".join(body.challenges),
        "Challenges Other": body.challenges_other,
        "Follow Up": body.follow_up,
        "Details": body.details,
        "Improve": ", ".join(body.improve),
        "Improve Other": body.improve_other,
        "One Thing": body.one_thing,
        "Value Most": ", ".join(body.value_most),
        "Value Most Other": body.value_most_other,
        "Continue Doing": body.continue_doing,
        "Promoter Improve": body.promoter_improve,
    }
    try:
        await asyncio.to_thread(sheets_service.append_nps_response, row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"message": "Thanks for your feedback."}
