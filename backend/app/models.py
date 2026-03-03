"""Pydantic models for all data entities."""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum
import uuid


# ── Enums ──────────────────────────────────────────────────────────────────

class ClassType(str, Enum):
    REGULAR = "Regular"
    OPTIONAL = "Optional"


class RequestStatus(str, Enum):
    PENDING = "Pending"
    APPROVED = "Approved"
    REJECTED = "Rejected"


class PaymentStatus(str, Enum):
    SANCTIONED = "Sanctioned"
    NON_SANCTIONED = "Non-sanctioned"
    UNPAID = "Unpaid"
    TO_BE_AUDITED = "To be Audited"


class RedFlag(str, Enum):
    YES = "Yes"
    NO = "No"


# ── Class ──────────────────────────────────────────────────────────────────

class ClassItem(BaseModel):
    sbat_group_id: str = ""
    instructor_email: str = ""
    instructor_name: str = ""
    program: str = ""
    batch_name: str = ""
    module_name: str = ""
    class_title: str = ""
    date_of_class: str = ""
    time_of_class: str = ""
    class_type: str = ""
    total_attendance_percentage: str = ""
    average_rating: str = ""
    number_of_ratings: str = ""


# ── Unavailability Request ─────────────────────────────────────────────────

class UnavailabilityRequestCreate(BaseModel):
    """Payload from instructor raising an unavailability request."""
    classes: List[dict] = Field(..., description="List of class objects selected")
    reason: str = Field(..., min_length=1)
    topics_and_promises: str = Field(..., min_length=1)
    batch_pulse_persona: str = Field(..., min_length=1)
    teaching_pace_style: str = Field(..., min_length=1)
    suggested_replacement: Optional[str] = ""
    other_comments: Optional[str] = ""
    approvers: List[str] = Field(default_factory=list, description="List of selected approvers")


class UnavailabilityRequestRow(BaseModel):
    """Full row representation in the sheet."""
    request_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    instructor_email: str = ""
    instructor_name: str = ""
    program: str = ""
    batch_name: str = ""
    sbat_group_id: str = ""
    module_name: str = ""
    class_title: str = ""
    original_date: str = ""
    original_time: str = ""
    class_type: str = ""
    reason: str = ""
    other_comments: str = ""
    suggested_replacement: str = ""
    topics_and_promises: str = ""
    batch_pulse_persona: str = ""
    teaching_pace_style: str = ""
    approvers: str = ""  # Comma-separated string for sheet
    raised_timestamp: str = ""
    raised_by: str = ""
    slack_thread_link: str = ""
    final_status: str = "Pending"
    replacement_instructor: str = ""
    class_rating_replacement: str = ""
    ri_taking_class: str = ""
    red_flag_proof: str = ""
    status: str = "Pending"
    locked_by: str = ""
    locked_at: str = ""


# ── Class Addition Request ─────────────────────────────────────────────────

class ClassAdditionRequestCreate(BaseModel):
    """Payload from instructor raising a class addition request."""
    program: str = Field(..., min_length=1)
    batch_name: str = Field(..., min_length=1)
    class_title: str = Field(..., min_length=1)
    module_name: str = Field(..., min_length=1)
    date_of_class: str = Field(..., min_length=1)
    time_of_class: str = Field(..., min_length=1)
    class_type: str = "Regular"
    shift_other_classes: str = "No"
    contest_impact: Optional[str] = ""
    assignment_requirement: str = "None"
    reason: str = Field(..., min_length=1)
    other_comments: Optional[str] = ""
    approver: str = Field("", description="Selected approver name")


class ClassAdditionRequestRow(BaseModel):
    """Full row representation in the sheet."""
    request_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    instructor_email: str = ""
    instructor_name: str = ""
    program: str = ""
    batch_name: str = ""
    class_title: str = ""
    module_name: str = ""
    date_of_class: str = ""
    time_of_class: str = ""
    class_type: str = ""
    shift_other_classes: str = ""
    contest_impact: str = ""
    assignment_requirement: str = ""
    reason: str = ""
    other_comments: str = ""
    approver: str = ""
    submitted_by: str = ""
    timestamp: str = ""
    slack_thread_link: str = ""
    actual_date: str = ""
    class_day_type: str = ""
    sanctioned: str = ""
    slack_link: str = ""
    red_flag: str = ""
    status: str = "Pending"
    locked_by: str = ""
    locked_at: str = ""


# ── Admin Models ───────────────────────────────────────────────────────────

class StatusUpdateRequest(BaseModel):
    status: RequestStatus
    payment_status: Optional[PaymentStatus] = None
    red_flag: Optional[RedFlag] = None
    red_flag_reason: Optional[str] = None
    replacement_instructor: Optional[str] = None
    final_status: Optional[str] = None
    rejection_reason: Optional[str] = None




# ── Auth Models ────────────────────────────────────────────────────────────

class UserInfo(BaseModel):
    email: str
    name: str
    picture: str = ""
    role: str = "instructor"  # "instructor" or "admin"
