"""Local filesystem storage service for screenshots, recordings, and reports."""
import os
import json
import uuid
import base64
import aiofiles
import logging
from datetime import datetime, timezone
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class StorageService:
    def __init__(self):
        self.base = settings.local_storage_path
        os.makedirs(f"{self.base}/screenshots", exist_ok=True)
        os.makedirs(f"{self.base}/recordings", exist_ok=True)
        os.makedirs(f"{self.base}/reports", exist_ok=True)

    async def save_screenshot(self, session_id: str, image_b64: str) -> str:
        """Save base64 PNG screenshot. Returns file path."""
        filename = f"{session_id}_{uuid.uuid4().hex[:8]}.png"
        path = f"{self.base}/screenshots/{filename}"
        data = base64.b64decode(image_b64)
        async with aiofiles.open(path, "wb") as f:
            await f.write(data)
        logger.debug(f"Saved screenshot: {path}")
        return path

    async def save_report(self, session_id: str, report_data: dict) -> str:
        """Save JSON report. Returns file path."""
        filename = f"report_{session_id}.json"
        path = f"{self.base}/reports/{filename}"
        async with aiofiles.open(path, "w") as f:
            await f.write(json.dumps(report_data, indent=2))
        logger.info(f"Saved report: {path}")
        return path

    async def read_report(self, session_id: str) -> dict | None:
        path = f"{self.base}/reports/report_{session_id}.json"
        if not os.path.exists(path):
            return None
        async with aiofiles.open(path, "r") as f:
            return json.loads(await f.read())

    def recording_path(self, session_id: str) -> str:
        return f"{self.base}/recordings/{session_id}.mp4"

    def screenshot_url(self, filename: str) -> str:
        return f"/local-storage/screenshots/{os.path.basename(filename)}"
