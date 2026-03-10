"""Session REST API endpoints."""
import asyncio
import logging
import os
from typing import List
from fastapi import APIRouter, Depends, HTTPException
import aiosqlite

from ..database import get_db
from ..models.session import SessionCreate, SessionRead, SessionUpdate
from ..models.test_case import TestCaseRead
from ..services.session_service import SessionService
from ..websocket.manager import ws_manager
from .. import shared_state


def _use_strands() -> bool:
    """Check if Strands orchestrator should be used (reads env var dynamically)."""
    val = os.environ.get("USE_STRANDS", "false").lower()
    return val in ("true", "1", "yes")

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def _get_svc(db: aiosqlite.Connection = Depends(get_db)) -> SessionService:
    return SessionService(db)


@router.post("", response_model=SessionRead, status_code=201)
async def create_session(
    data: SessionCreate,
    svc: SessionService = Depends(_get_svc),
):
    session = await svc.create_session(data)

    # Create a per-session queue for mid-run user messages
    queue: asyncio.Queue = asyncio.Queue()
    shared_state.session_queues[session.id] = queue

    # Schedule the orchestrator as a real asyncio.Task so we can cancel it
    task = asyncio.create_task(_run_orchestrator(session.id, data, queue))
    shared_state.running_tasks[session.id] = task

    return session


@router.get("", response_model=List[SessionRead])
async def list_sessions(svc: SessionService = Depends(_get_svc)):
    return await svc.list_sessions()


@router.get("/{session_id}", response_model=SessionRead)
async def get_session(session_id: str, svc: SessionService = Depends(_get_svc)):
    session = await svc.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    return session


@router.get("/{session_id}/test-cases", response_model=List[TestCaseRead])
async def get_test_cases(session_id: str, svc: SessionService = Depends(_get_svc)):
    return await svc.list_test_cases(session_id)


@router.delete("/{session_id}", status_code=204)
async def cancel_session(session_id: str, svc: SessionService = Depends(_get_svc)):
    session = await svc.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    # Cancel the running asyncio task (triggers CancelledError in orchestrator)
    task = shared_state.running_tasks.get(session_id)
    if task and not task.done():
        task.cancel()
        # Orchestrator's CancelledError handler updates status + sends WS message
    else:
        # Already finished — just mark cancelled and notify
        await svc.update_session(session_id, SessionUpdate(status="cancelled"))
        await ws_manager.send_cancelled(session_id)


_task_logger = logging.getLogger(__name__)


async def _run_orchestrator(session_id: str, data: SessionCreate, queue: asyncio.Queue):
    """Background task: run the AetherTest agent pipeline."""
    from ..database import _db_path
    
    use_strands = _use_strands()
    _task_logger.info(f"[{session_id[:8]}] Background task started (USE_STRANDS={use_strands})")
    try:
        async with aiosqlite.connect(_db_path) as db:
            db.row_factory = aiosqlite.Row
            svc = SessionService(db)
            
            # Choose orchestrator based on environment variable
            if use_strands:
                from ..agents.strands_orchestrator import StrandsAetherTestOrchestrator
                _task_logger.info(f"[{session_id[:8]}] Using Strands Agents SDK orchestrator")
                orchestrator = StrandsAetherTestOrchestrator(ws_manager, svc)
            else:
                from ..agents.orchestrator import AetherTestOrchestrator
                _task_logger.info(f"[{session_id[:8]}] Using original Bedrock Converse orchestrator")
                orchestrator = AetherTestOrchestrator(ws_manager, svc)
            
            await orchestrator.run(
                session_id=session_id,
                requirement=data.requirement,
                target_url=data.target_url,
                credential_name=data.credential_name,
                message_queue=queue,
                test_case_count=data.test_case_count,
            )
    except asyncio.CancelledError:
        _task_logger.warning(f"[{session_id[:8]}] Background task cancelled")
        raise
    except Exception as e:
        _task_logger.exception(f"[{session_id[:8]}] Background task crashed: {e}")
        raise
    finally:
        _task_logger.info(f"[{session_id[:8]}] Background task finished — cleaning up")
        shared_state.running_tasks.pop(session_id, None)
        shared_state.session_queues.pop(session_id, None)
