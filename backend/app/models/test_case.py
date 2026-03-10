"""Test case Pydantic models."""
from typing import Optional, Literal, List
from pydantic import BaseModel, Field


TestCaseStatus = Literal["pending", "running", "passed", "failed", "blocked", "skipped"]


class TestStep(BaseModel):
    step_number: int
    action: str
    expected: Optional[str] = None


class TestCaseCreate(BaseModel):
    session_id: str
    title: str
    description: Optional[str] = None
    steps: List[TestStep] = Field(default_factory=list)
    expected: Optional[str] = None


class TestCaseRead(BaseModel):
    id: str
    session_id: str
    title: str
    description: Optional[str] = None
    steps: List[TestStep]
    expected: Optional[str] = None
    status: TestCaseStatus
    evidence: Optional[str] = None
    created_at: str
    updated_at: str


class TestCaseUpdate(BaseModel):
    status: Optional[TestCaseStatus] = None
    evidence: Optional[str] = None
