"""Recording start/stop API endpoints."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.recording_service import RecordingService

router = APIRouter(prefix="/api/recording", tags=["recording"])
_svc = RecordingService()


class RecordingRequest(BaseModel):
    session_id: str


@router.post("/start")
async def start_recording(req: RecordingRequest):
    result = await _svc.start(req.session_id)
    if result.get("status") == "error":
        raise HTTPException(502, f"Recorder error: {result.get('error')}")
    return result


@router.post("/stop")
async def stop_recording(req: RecordingRequest):
    result = await _svc.stop(req.session_id)
    if result.get("status") == "error":
        raise HTTPException(502, f"Recorder error: {result.get('error')}")
    return result


@router.get("/status/{session_id}")
async def recording_status(session_id: str):
    return await _svc.status(session_id)
