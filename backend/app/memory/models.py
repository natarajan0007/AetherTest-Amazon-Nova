"""Memory data models."""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class Memory:
    """A single memory entry."""
    id: int
    source: str
    raw_text: str
    summary: str
    entities: list[str] = field(default_factory=list)
    topics: list[str] = field(default_factory=list)
    connections: list[dict] = field(default_factory=list)
    importance: float = 0.5
    created_at: str = ""
    consolidated: bool = False
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "source": self.source,
            "raw_text": self.raw_text,
            "summary": self.summary,
            "entities": self.entities,
            "topics": self.topics,
            "connections": self.connections,
            "importance": self.importance,
            "created_at": self.created_at,
            "consolidated": self.consolidated,
        }


@dataclass
class Consolidation:
    """A consolidation record linking multiple memories."""
    id: int
    source_ids: list[int]
    summary: str
    insight: str
    created_at: str = ""
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "source_ids": self.source_ids,
            "summary": self.summary,
            "insight": self.insight,
            "created_at": self.created_at,
        }


@dataclass
class MemoryStats:
    """Memory system statistics."""
    total_memories: int = 0
    unconsolidated: int = 0
    consolidations: int = 0
    
    def to_dict(self) -> dict:
        return {
            "total_memories": self.total_memories,
            "unconsolidated": self.unconsolidated,
            "consolidations": self.consolidations,
        }
