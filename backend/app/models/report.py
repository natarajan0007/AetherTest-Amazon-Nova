"""Report Pydantic models."""
from typing import Optional, List
from pydantic import BaseModel, Field


class TestResult(BaseModel):
    test_case_id: str
    title: str
    status: str
    evidence: Optional[str] = None
    duration_seconds: float = 0.0


class ReportData(BaseModel):
    session_id: str
    requirement: str
    target_url: str
    total_tests: int = 0
    passed: int = 0
    failed: int = 0
    blocked: int = 0
    skipped: int = 0
    quality_score: float = 0.0
    summary: str = ""
    test_results: List[TestResult] = Field(default_factory=list)
    screenshots: List[str] = Field(default_factory=list)
    recording_path: Optional[str] = None
    created_at: str = ""


class ReportRead(BaseModel):
    id: str
    session_id: str
    data: ReportData
    file_path: Optional[str] = None
    created_at: str
