"""WebSocket connection manager for real-time agent updates."""
import json
import asyncio
from typing import Dict, List, Any
from fastapi import WebSocket
import logging

logger = logging.getLogger(__name__)


class WebSocketManager:
    def __init__(self):
        # session_id -> list of active WebSocket connections
        self._connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        if session_id not in self._connections:
            self._connections[session_id] = []
        self._connections[session_id].append(websocket)
        logger.info(f"WS connected: session={session_id}, total={len(self._connections[session_id])}")

    def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        if session_id in self._connections:
            self._connections[session_id] = [
                ws for ws in self._connections[session_id] if ws is not websocket
            ]
            if not self._connections[session_id]:
                del self._connections[session_id]
        logger.info(f"WS disconnected: session={session_id}")

    async def send_to_session(self, session_id: str, message: dict) -> None:
        """Broadcast a message to all connections for a session."""
        connections = self._connections.get(session_id, [])
        if not connections:
            return
        dead = []
        payload = json.dumps(message)
        for ws in connections:
            try:
                await ws.send_text(payload)
            except Exception as e:
                logger.warning(f"WS send error: {e}")
                dead.append(ws)
        for ws in dead:
            self.disconnect(session_id, ws)

    async def send_agent_update(
        self,
        session_id: str,
        agent: str,
        status: str,
        message: str,
    ) -> None:
        await self.send_to_session(session_id, {
            "type": "agent_update",
            "agent": agent,
            "status": status,
            "message": message,
        })

    async def send_test_cases(self, session_id: str, test_cases: list) -> None:
        await self.send_to_session(session_id, {
            "type": "test_cases",
            "testCases": test_cases,
        })

    async def send_browser_action(
        self,
        session_id: str,
        action: str,
        screenshot: str | None = None,
    ) -> None:
        msg: dict[str, Any] = {"type": "browser_action", "action": action}
        if screenshot:
            msg["screenshot"] = screenshot
        await self.send_to_session(session_id, msg)

    async def send_monitor_result(
        self,
        session_id: str,
        test_id: str,
        status: str,
        evidence: str,
    ) -> None:
        await self.send_to_session(session_id, {
            "type": "monitor_result",
            "testId": test_id,
            "status": status,
            "evidence": evidence,
        })

    async def send_report(self, session_id: str, report_id: str, data: dict) -> None:
        await self.send_to_session(session_id, {
            "type": "report",
            "reportId": report_id,
            "data": data,
        })

    async def send_complete(
        self,
        session_id: str,
        summary: str,
        quality_score: float,
    ) -> None:
        await self.send_to_session(session_id, {
            "type": "complete",
            "summary": summary,
            "qualityScore": quality_score,
        })

    async def send_error(self, session_id: str, message: str) -> None:
        await self.send_to_session(session_id, {
            "type": "error",
            "message": message,
        })

    async def send_cancelled(self, session_id: str) -> None:
        await self.send_to_session(session_id, {"type": "cancelled"})

    async def send_recording(
        self, session_id: str, event: str, filename: str
    ) -> None:
        """Notify frontend that recording started/stopped and provide filename."""
        await self.send_to_session(session_id, {
            "type": "recording",
            "event": event,        # "started" | "stopped"
            "filename": filename,
        })


# Singleton
ws_manager = WebSocketManager()
