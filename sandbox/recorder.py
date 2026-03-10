"""FFmpeg screen recording API server for the sandbox container."""
import asyncio
import os
import subprocess
import time
from datetime import datetime
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="AetherTest Recorder API")

STORAGE_PATH = "/local-storage/recordings"
DISPLAY = os.environ.get("DISPLAY", ":99")
SCREEN_WIDTH = int(os.environ.get("SCREEN_WIDTH", "1280"))
SCREEN_HEIGHT = int(os.environ.get("SCREEN_HEIGHT", "800"))

# Active recording processes keyed by session_id
_recordings: dict[str, dict] = {}


class StartRequest(BaseModel):
    session_id: str


class StopRequest(BaseModel):
    session_id: str


@app.post("/recording/start")
async def start_recording(req: StartRequest):
    session_id = req.session_id
    if session_id in _recordings:
        raise HTTPException(400, f"Recording already active for session {session_id}")

    os.makedirs(STORAGE_PATH, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"{STORAGE_PATH}/{session_id}_{timestamp}.mp4"

    cmd = [
        "ffmpeg",
        "-f", "x11grab",
        "-r", "10",
        "-s", f"{SCREEN_WIDTH}x{SCREEN_HEIGHT}",
        "-i", f"{DISPLAY}.0",
        "-vcodec", "libx264",
        "-preset", "ultrafast",
        "-crf", "28",
        "-y",
        filename,
    ]

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    _recordings[session_id] = {
        "process": proc,
        "filename": filename,
        "started_at": time.time(),
    }
    return {"status": "started", "filename": filename}


@app.post("/recording/stop")
async def stop_recording(req: StopRequest):
    session_id = req.session_id
    if session_id not in _recordings:
        raise HTTPException(404, f"No active recording for session {session_id}")

    rec = _recordings.pop(session_id)
    proc: subprocess.Popen = rec["process"]
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()

    return {"status": "stopped", "filename": rec["filename"]}


@app.get("/recording/status/{session_id}")
async def recording_status(session_id: str):
    if session_id in _recordings:
        rec = _recordings[session_id]
        return {
            "active": True,
            "filename": rec["filename"],
            "duration_seconds": time.time() - rec["started_at"],
        }
    return {"active": False}


@app.get("/health")
async def health():
    return {"status": "ok", "display": DISPLAY}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8888)
