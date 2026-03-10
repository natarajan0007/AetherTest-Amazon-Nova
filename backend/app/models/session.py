"""Session Pydantic models."""
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field
import uuid


SessionStatus = Literal["pending", "running", "completed", "failed", "cancelled"]


class SessionCreate(BaseModel):
    requirement: str
    target_url: str
    credential_name: Optional[str] = None
    test_case_count: int = 20


class SessionRead(BaseModel):
    id: str
    status: SessionStatus
    requirement: str
    target_url: str
    created_at: str
    updated_at: str
    report_id: Optional[str] = None
    metadata: dict = Field(default_factory=dict)


class SessionUpdate(BaseModel):
    status: Optional[SessionStatus] = None
    report_id: Optional[str] = None
    metadata: Optional[dict] = None
