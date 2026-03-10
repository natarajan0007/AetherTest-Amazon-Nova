"""FastAPI application entry point."""
import json
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import os

from .config import get_settings
from .database import init_db
from .websocket.manager import ws_manager
from .api import sessions, credentials, recording

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing database...")
    await init_db()
    logger.info("AetherTest backend ready.")
    yield
    logger.info("Shutting down.")


app = FastAPI(
    title="AetherTest API",
    description="Autonomous STLC Engine",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow all origins for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global handler so unhandled exceptions still get CORS headers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers={"Access-Control-Allow-Origin": "*"},
    )

# REST routers
app.include_router(sessions.router)
app.include_router(credentials.router)
app.include_router(recording.router)

# Serve local storage files (screenshots, reports, recordings)
storage_path = settings.local_storage_path
logger.info(f"Local storage path: {storage_path}")
logger.info(f"Local storage exists: {os.path.exists(storage_path)}")
if os.path.exists(storage_path):
    recordings_path = os.path.join(storage_path, "recordings")
    if os.path.exists(recordings_path):
        logger.info(f"Recordings in storage: {os.listdir(recordings_path)}")
os.makedirs(storage_path, exist_ok=True)
os.makedirs(os.path.join(storage_path, "recordings"), exist_ok=True)
os.makedirs(os.path.join(storage_path, "screenshots"), exist_ok=True)
app.mount("/local-storage", StaticFiles(directory=storage_path), name="local-storage")


# WebSocket endpoint
@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    from .shared_state import session_queues

    await ws_manager.connect(session_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
            else:
                # Handle structured JSON messages from the frontend
                try:
                    msg = json.loads(data)
                    if msg.get("type") == "user_message":
                        content = str(msg.get("content", "")).strip()
                        if content:
                            # Feed into the running orchestrator's queue
                            q = session_queues.get(session_id)
                            if q:
                                await q.put(content)
                            # Echo back to all clients so it appears in every chat panel
                            await ws_manager.send_to_session(session_id, {
                                "type": "user_chat",
                                "content": content,
                            })
                except (json.JSONDecodeError, Exception):
                    pass
    except WebSocketDisconnect:
        ws_manager.disconnect(session_id, websocket)
    except Exception as e:
        logger.error(f"WebSocket error for session {session_id}: {e}")
        ws_manager.disconnect(session_id, websocket)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "AetherTest"}
