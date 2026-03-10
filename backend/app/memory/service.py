"""Memory Service - Unified interface for memory operations.

Automatically selects between local SQLite and AWS AgentCore Memory
based on environment configuration.
"""
import logging
from functools import lru_cache
from typing import Optional, Protocol

from .models import Memory, Consolidation, MemoryStats
from .local_store import LocalMemoryStore
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class MemoryStoreProtocol(Protocol):
    """Protocol defining the memory store interface."""
    
    def store_memory(
        self,
        raw_text: str,
        summary: str,
        entities: list[str],
        topics: list[str],
        importance: float,
        source: str,
    ) -> dict: ...
    
    def get_all_memories(self, limit: int) -> list[Memory]: ...
    def get_unconsolidated_memories(self, limit: int) -> list[Memory]: ...
    def get_memory_by_id(self, memory_id: int) -> Optional[Memory]: ...
    def delete_memory(self, memory_id: int) -> dict: ...
    def search_memories(self, query: str, limit: int) -> list[Memory]: ...
    
    def store_consolidation(
        self,
        source_ids: list[int],
        summary: str,
        insight: str,
        connections: list[dict],
    ) -> dict: ...
    
    def get_consolidation_history(self, limit: int) -> list[Consolidation]: ...
    def get_stats(self) -> MemoryStats: ...
    def clear_all(self) -> dict: ...


class MemoryService:
    """Unified memory service that delegates to the appropriate store.
    
    Configuration via environment variables:
    - MEMORY_STORE_TYPE: "local" (default) or "agentcore"
    - MEMORY_DB_PATH: SQLite database path (for local store)
    - AGENTCORE_MEMORY_ID: AgentCore Memory ID (for AWS deployment)
    - AGENTCORE_MEMORY_REGION: AWS region for AgentCore (default: us-west-2)
    """
    
    def __init__(self, store: MemoryStoreProtocol = None):
        if store:
            self._store = store
        else:
            self._store = self._create_store()
    
    def _create_store(self) -> MemoryStoreProtocol:
        """Create the appropriate memory store based on configuration."""
        store_type = getattr(settings, 'memory_store_type', 'local').lower()
        
        if store_type == "agentcore":
            # Check if AgentCore is configured
            memory_id = getattr(settings, 'agentcore_memory_id', '')
            if memory_id:
                try:
                    from .agentcore_store import AgentCoreMemoryStore
                    logger.info("Using AWS AgentCore Memory store")
                    return AgentCoreMemoryStore(memory_id=memory_id)
                except Exception as e:
                    logger.warning(f"Failed to initialize AgentCore Memory, falling back to local: {e}")
        
        # Default to local SQLite store
        db_path = getattr(settings, 'memory_db_path', './data/memory.db')
        logger.info(f"Using local SQLite memory store: {db_path}")
        return LocalMemoryStore(db_path=db_path)
    
    # ── Memory Operations ──────────────────────────────────────────────────────
    
    def store_memory(
        self,
        raw_text: str,
        summary: str,
        entities: list[str] = None,
        topics: list[str] = None,
        importance: float = 0.5,
        source: str = "",
    ) -> dict:
        """Store a new memory."""
        return self._store.store_memory(
            raw_text=raw_text,
            summary=summary,
            entities=entities or [],
            topics=topics or [],
            importance=importance,
            source=source,
        )
    
    def get_all_memories(self, limit: int = 50) -> list[Memory]:
        """Get all memories, most recent first."""
        return self._store.get_all_memories(limit=limit)
    
    def get_unconsolidated_memories(self, limit: int = 10) -> list[Memory]:
        """Get memories that haven't been consolidated."""
        return self._store.get_unconsolidated_memories(limit=limit)
    
    def get_memory_by_id(self, memory_id: int) -> Optional[Memory]:
        """Get a specific memory by ID."""
        return self._store.get_memory_by_id(memory_id)
    
    def delete_memory(self, memory_id: int) -> dict:
        """Delete a memory by ID."""
        return self._store.delete_memory(memory_id)
    
    def search_memories(self, query: str, limit: int = 10) -> list[Memory]:
        """Search memories by text content."""
        return self._store.search_memories(query=query, limit=limit)
    
    # ── Consolidation Operations ───────────────────────────────────────────────
    
    def store_consolidation(
        self,
        source_ids: list[int],
        summary: str,
        insight: str,
        connections: list[dict] = None,
    ) -> dict:
        """Store a consolidation record."""
        return self._store.store_consolidation(
            source_ids=source_ids,
            summary=summary,
            insight=insight,
            connections=connections or [],
        )
    
    def get_consolidation_history(self, limit: int = 10) -> list[Consolidation]:
        """Get consolidation history."""
        return self._store.get_consolidation_history(limit=limit)
    
    # ── Stats & Utilities ──────────────────────────────────────────────────────
    
    def get_stats(self) -> MemoryStats:
        """Get memory system statistics."""
        return self._store.get_stats()
    
    def clear_all(self) -> dict:
        """Clear all memories and consolidations."""
        return self._store.clear_all()
    
    # ── High-Level Operations ──────────────────────────────────────────────────
    
    def ingest_text(self, text: str, source: str = "") -> dict:
        """Ingest raw text and extract structured memory.
        
        This is a simplified version - in production, you'd use an LLM
        to extract entities, topics, and generate a summary.
        """
        # Simple extraction (in production, use LLM)
        summary = text[:200] + "..." if len(text) > 200 else text
        
        # Basic entity/topic extraction (placeholder)
        entities = []
        topics = []
        
        return self.store_memory(
            raw_text=text,
            summary=summary,
            entities=entities,
            topics=topics,
            importance=0.5,
            source=source,
        )
    
    def query_memories(self, question: str) -> dict:
        """Query memories to answer a question.
        
        Returns relevant memories that might help answer the question.
        """
        # Search for relevant memories
        relevant = self.search_memories(question, limit=10)
        
        # Get recent consolidations for context
        consolidations = self.get_consolidation_history(limit=5)
        
        return {
            "question": question,
            "relevant_memories": [m.to_dict() for m in relevant],
            "consolidations": [c.to_dict() for c in consolidations],
            "total_found": len(relevant),
        }


# ── Singleton accessor ─────────────────────────────────────────────────────────

_memory_service: Optional[MemoryService] = None


def get_memory_service() -> MemoryService:
    """Get the singleton memory service instance."""
    global _memory_service
    if _memory_service is None:
        _memory_service = MemoryService()
    return _memory_service
