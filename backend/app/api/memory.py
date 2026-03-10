"""Memory API endpoints for the dashboard."""
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from ..memory import get_memory_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/memory", tags=["memory"])


# ── Request/Response Models ────────────────────────────────────────────────────

class IngestRequest(BaseModel):
    text: str
    source: str = "api"


class StoreMemoryRequest(BaseModel):
    raw_text: str
    summary: str
    entities: list[str] = []
    topics: list[str] = []
    importance: float = 0.5
    source: str = ""


class ConsolidateRequest(BaseModel):
    source_ids: list[int]
    summary: str
    insight: str
    connections: list[dict] = []


class DeleteRequest(BaseModel):
    memory_id: int


class QueryRequest(BaseModel):
    question: str


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/status")
async def get_status():
    """Get memory system status and statistics."""
    try:
        svc = get_memory_service()
        stats = svc.get_stats()
        return stats.to_dict()
    except Exception as e:
        logger.error(f"Memory status error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/memories")
async def get_memories(limit: int = 50):
    """Get all memories, most recent first."""
    try:
        svc = get_memory_service()
        memories = svc.get_all_memories(limit=limit)
        return {
            "memories": [m.to_dict() for m in memories],
            "count": len(memories),
        }
    except Exception as e:
        logger.error(f"Get memories error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/memories/unconsolidated")
async def get_unconsolidated(limit: int = 10):
    """Get memories that haven't been consolidated yet."""
    try:
        svc = get_memory_service()
        memories = svc.get_unconsolidated_memories(limit=limit)
        return {
            "memories": [m.to_dict() for m in memories],
            "count": len(memories),
        }
    except Exception as e:
        logger.error(f"Get unconsolidated error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/memories/{memory_id}")
async def get_memory(memory_id: int):
    """Get a specific memory by ID."""
    try:
        svc = get_memory_service()
        memory = svc.get_memory_by_id(memory_id)
        if not memory:
            raise HTTPException(status_code=404, detail="Memory not found")
        return memory.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get memory error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ingest")
async def ingest_text(request: IngestRequest):
    """Ingest raw text into memory."""
    try:
        if not request.text.strip():
            raise HTTPException(status_code=400, detail="Text cannot be empty")
        
        svc = get_memory_service()
        result = svc.ingest_text(text=request.text, source=request.source)
        return {"status": "ingested", "result": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ingest error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/store")
async def store_memory(request: StoreMemoryRequest):
    """Store a structured memory directly."""
    try:
        svc = get_memory_service()
        result = svc.store_memory(
            raw_text=request.raw_text,
            summary=request.summary,
            entities=request.entities,
            topics=request.topics,
            importance=request.importance,
            source=request.source,
        )
        return result
    except Exception as e:
        logger.error(f"Store memory error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/consolidate")
async def consolidate_memories(request: ConsolidateRequest):
    """Store a consolidation record."""
    try:
        svc = get_memory_service()
        result = svc.store_consolidation(
            source_ids=request.source_ids,
            summary=request.summary,
            insight=request.insight,
            connections=request.connections,
        )
        return result
    except Exception as e:
        logger.error(f"Consolidate error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/consolidations")
async def get_consolidations(limit: int = 10):
    """Get consolidation history."""
    try:
        svc = get_memory_service()
        consolidations = svc.get_consolidation_history(limit=limit)
        return {
            "consolidations": [c.to_dict() for c in consolidations],
            "count": len(consolidations),
        }
    except Exception as e:
        logger.error(f"Get consolidations error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search")
async def search_memories(q: str, limit: int = 10):
    """Search memories by text content."""
    try:
        if not q.strip():
            raise HTTPException(status_code=400, detail="Query cannot be empty")
        
        svc = get_memory_service()
        memories = svc.search_memories(query=q, limit=limit)
        return {
            "query": q,
            "memories": [m.to_dict() for m in memories],
            "count": len(memories),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/query")
async def query_memories(request: QueryRequest):
    """Query memories using AI to generate intelligent answers."""
    try:
        if not request.question.strip():
            raise HTTPException(status_code=400, detail="Question cannot be empty")
        
        svc = get_memory_service()
        # Use AI-powered query
        result = await svc.query_memories_with_ai(question=request.question)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Query error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/memories/{memory_id}")
async def delete_memory(memory_id: int):
    """Delete a memory by ID."""
    try:
        svc = get_memory_service()
        result = svc.delete_memory(memory_id)
        return result
    except Exception as e:
        logger.error(f"Delete memory error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/clear")
async def clear_all_memories():
    """Clear all memories and consolidations. Use with caution!"""
    try:
        svc = get_memory_service()
        result = svc.clear_all()
        return result
    except Exception as e:
        logger.error(f"Clear error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
