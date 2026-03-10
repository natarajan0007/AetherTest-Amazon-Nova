"""FFmpeg recording control via sandbox recorder API."""
import httpx
import logging
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class RecordingService:
    def __init__(self):
        self.base_url = settings.sandbox_recorder_url

    async def start(self, session_id: str) -> dict:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{self.base_url}/recording/start",
                    json={"session_id": session_id},
                )
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            logger.warning(f"Failed to start recording for {session_id}: {e}")
            return {"status": "error", "error": str(e)}

    async def stop(self, session_id: str) -> dict:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{self.base_url}/recording/stop",
                    json={"session_id": session_id},
                )
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            logger.warning(f"Failed to stop recording for {session_id}: {e}")
            return {"status": "error", "error": str(e)}

    async def status(self, session_id: str) -> dict:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(
                    f"{self.base_url}/recording/status/{session_id}"
                )
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            logger.warning(f"Failed to get recording status for {session_id}: {e}")
            return {"active": False, "error": str(e)}
