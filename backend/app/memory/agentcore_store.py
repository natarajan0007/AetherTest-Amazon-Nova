"""AWS Bedrock AgentCore Memory store for production deployment."""
import json
import logging
from datetime import datetime, timezone
from typing import Optional

import boto3
from botocore.config import Config

from .models import Memory, Consolidation, MemoryStats
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class AgentCoreMemoryStore:
    """AWS Bedrock AgentCore Memory store for production.
    
    Uses AWS Bedrock AgentCore Memory service for:
    - Short-term memory (session context)
    - Long-term memory (test history, patterns)
    - Semantic search across memories
    
    Reference: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory.html
    """
    
    def __init__(
        self,
        memory_id: str = None,
        region: str = None,
    ):
        self.memory_id = memory_id or settings.agentcore_memory_id
        self.region = region or settings.agentcore_memory_region or "us-west-2"
        
        # Create boto3 client for AgentCore
        session_kwargs = {
            'aws_access_key_id': settings.aws_access_key_id,
            'aws_secret_access_key': settings.aws_secret_access_key,
            'region_name': self.region,
        }
        if settings.aws_session_token:
            session_kwargs['aws_session_token'] = settings.aws_session_token
        
        boto_session = boto3.Session(**session_kwargs)
        
        # AgentCore Memory client
        # Note: This uses the bedrock-agent-runtime service
        self.client = boto_session.client(
            'bedrock-agent-runtime',
            config=Config(
                retries={'max_attempts': 3, 'mode': 'adaptive'},
                connect_timeout=10,
                read_timeout=60,
            )
        )
        
        logger.info(f"AgentCore Memory initialized: {self.memory_id} in {self.region}")
    
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
        """Store a memory event in AgentCore Memory."""
        entities = entities or []
        topics = topics or []
        
        try:
            # Create event payload
            event_data = {
                "source": source,
                "raw_text": raw_text,
                "summary": summary,
                "entities": entities,
                "topics": topics,
                "importance": importance,
                "type": "memory",
            }
            
            # Store as an event in AgentCore Memory
            response = self.client.create_memory_event(
                memoryId=self.memory_id,
                content=json.dumps(event_data),
                eventType="MEMORY_STORE",
            )
            
            event_id = response.get("eventId", "unknown")
            logger.info(f"📥 Stored memory in AgentCore: {event_id}")
            
            return {
                "memory_id": event_id,
                "status": "stored",
                "summary": summary,
            }
            
        except Exception as e:
            logger.error(f"AgentCore Memory store failed: {e}")
            # Fallback: return error but don't crash
            return {
                "memory_id": None,
                "status": "error",
                "error": str(e),
            }
    
    def get_all_memories(self, limit: int = 50) -> list[Memory]:
        """Get all memories from AgentCore Memory."""
        try:
            response = self.client.list_memory_events(
                memoryId=self.memory_id,
                maxResults=limit,
            )
            
            memories = []
            for event in response.get("events", []):
                try:
                    data = json.loads(event.get("content", "{}"))
                    if data.get("type") == "memory":
                        memories.append(Memory(
                            id=hash(event.get("eventId", "")),  # Convert to int
                            source=data.get("source", ""),
                            raw_text=data.get("raw_text", ""),
                            summary=data.get("summary", ""),
                            entities=data.get("entities", []),
                            topics=data.get("topics", []),
                            connections=data.get("connections", []),
                            importance=data.get("importance", 0.5),
                            created_at=event.get("createdAt", ""),
                            consolidated=data.get("consolidated", False),
                        ))
                except json.JSONDecodeError:
                    continue
            
            return memories
            
        except Exception as e:
            logger.error(f"AgentCore Memory list failed: {e}")
            return []
    
    def get_unconsolidated_memories(self, limit: int = 10) -> list[Memory]:
        """Get unconsolidated memories."""
        all_memories = self.get_all_memories(limit=100)
        return [m for m in all_memories if not m.consolidated][:limit]
    
    def get_memory_by_id(self, memory_id: int) -> Optional[Memory]:
        """Get a specific memory by ID."""
        # AgentCore doesn't support direct ID lookup easily
        # Search through recent memories
        all_memories = self.get_all_memories(limit=100)
        for m in all_memories:
            if m.id == memory_id:
                return m
        return None
    
    def delete_memory(self, memory_id: int) -> dict:
        """Delete a memory (mark as deleted in AgentCore)."""
        # AgentCore Memory doesn't support direct deletion
        # We'd need to store a "deleted" event
        logger.warning(f"AgentCore Memory doesn't support direct deletion: {memory_id}")
        return {"status": "not_supported", "memory_id": memory_id}
    
    def search_memories(self, query: str, limit: int = 10) -> list[Memory]:
        """Search memories using AgentCore semantic search."""
        try:
            response = self.client.search_memory_records(
                memoryId=self.memory_id,
                query=query,
                maxResults=limit,
            )
            
            memories = []
            for record in response.get("records", []):
                try:
                    data = json.loads(record.get("content", "{}"))
                    memories.append(Memory(
                        id=hash(record.get("recordId", "")),
                        source=data.get("source", ""),
                        raw_text=data.get("raw_text", ""),
                        summary=data.get("summary", ""),
                        entities=data.get("entities", []),
                        topics=data.get("topics", []),
                        connections=[],
                        importance=data.get("importance", 0.5),
                        created_at=record.get("createdAt", ""),
                        consolidated=False,
                    ))
                except json.JSONDecodeError:
                    continue
            
            return memories
            
        except Exception as e:
            logger.error(f"AgentCore Memory search failed: {e}")
            return []
    
    # ── Consolidation Operations ───────────────────────────────────────────────
    
    def store_consolidation(
        self,
        source_ids: list[int],
        summary: str,
        insight: str,
        connections: list[dict] = None,
    ) -> dict:
        """Store a consolidation event."""
        connections = connections or []
        
        try:
            event_data = {
                "type": "consolidation",
                "source_ids": source_ids,
                "summary": summary,
                "insight": insight,
                "connections": connections,
            }
            
            response = self.client.create_memory_event(
                memoryId=self.memory_id,
                content=json.dumps(event_data),
                eventType="CONSOLIDATION",
            )
            
            logger.info(f"🔄 Stored consolidation in AgentCore")
            return {
                "status": "consolidated",
                "memories_processed": len(source_ids),
                "insight": insight,
            }
            
        except Exception as e:
            logger.error(f"AgentCore consolidation failed: {e}")
            return {"status": "error", "error": str(e)}
    
    def get_consolidation_history(self, limit: int = 10) -> list[Consolidation]:
        """Get consolidation history."""
        try:
            response = self.client.list_memory_events(
                memoryId=self.memory_id,
                eventType="CONSOLIDATION",
                maxResults=limit,
            )
            
            consolidations = []
            for event in response.get("events", []):
                try:
                    data = json.loads(event.get("content", "{}"))
                    consolidations.append(Consolidation(
                        id=hash(event.get("eventId", "")),
                        source_ids=data.get("source_ids", []),
                        summary=data.get("summary", ""),
                        insight=data.get("insight", ""),
                        created_at=event.get("createdAt", ""),
                    ))
                except json.JSONDecodeError:
                    continue
            
            return consolidations
            
        except Exception as e:
            logger.error(f"AgentCore consolidation history failed: {e}")
            return []
    
    # ── Stats & Utilities ──────────────────────────────────────────────────────
    
    def get_stats(self) -> MemoryStats:
        """Get memory statistics."""
        memories = self.get_all_memories(limit=1000)
        consolidations = self.get_consolidation_history(limit=1000)
        
        return MemoryStats(
            total_memories=len(memories),
            unconsolidated=len([m for m in memories if not m.consolidated]),
            consolidations=len(consolidations),
        )
    
    def clear_all(self) -> dict:
        """Clear all memories (not supported in AgentCore)."""
        logger.warning("AgentCore Memory doesn't support clearing all memories")
        return {"status": "not_supported"}
