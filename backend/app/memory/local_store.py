"""Local SQLite-based memory store for development."""
import json
import sqlite3
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .models import Memory, Consolidation, MemoryStats

logger = logging.getLogger(__name__)


class LocalMemoryStore:
    """SQLite-based memory store for local development."""
    
    def __init__(self, db_path: str = "./data/memory.db"):
        self.db_path = db_path
        self._ensure_db()
    
    def _ensure_db(self):
        """Create database and tables if they don't exist."""
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        db = self._get_db()
        db.executescript("""
            CREATE TABLE IF NOT EXISTS memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL DEFAULT '',
                raw_text TEXT NOT NULL,
                summary TEXT NOT NULL,
                entities TEXT NOT NULL DEFAULT '[]',
                topics TEXT NOT NULL DEFAULT '[]',
                connections TEXT NOT NULL DEFAULT '[]',
                importance REAL NOT NULL DEFAULT 0.5,
                created_at TEXT NOT NULL,
                consolidated INTEGER NOT NULL DEFAULT 0
            );
            
            CREATE TABLE IF NOT EXISTS consolidations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_ids TEXT NOT NULL,
                summary TEXT NOT NULL,
                insight TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            
            CREATE TABLE IF NOT EXISTS processed_files (
                path TEXT PRIMARY KEY,
                processed_at TEXT NOT NULL
            );
            
            CREATE INDEX IF NOT EXISTS idx_memories_consolidated ON memories(consolidated);
            CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
        """)
        db.commit()
        db.close()
    
    def _get_db(self) -> sqlite3.Connection:
        """Get a database connection."""
        db = sqlite3.connect(self.db_path)
        db.row_factory = sqlite3.Row
        return db
    
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
        entities = entities or []
        topics = topics or []
        
        db = self._get_db()
        now = datetime.now(timezone.utc).isoformat()
        
        cursor = db.execute(
            """INSERT INTO memories (source, raw_text, summary, entities, topics, importance, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (source, raw_text, summary, json.dumps(entities), json.dumps(topics), importance, now),
        )
        db.commit()
        memory_id = cursor.lastrowid
        db.close()
        
        logger.info(f"📥 Stored memory #{memory_id}: {summary[:60]}...")
        return {"memory_id": memory_id, "status": "stored", "summary": summary}
    
    def get_all_memories(self, limit: int = 50) -> list[Memory]:
        """Get all memories, most recent first."""
        db = self._get_db()
        rows = db.execute(
            "SELECT * FROM memories ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
        db.close()
        
        return [self._row_to_memory(r) for r in rows]
    
    def get_unconsolidated_memories(self, limit: int = 10) -> list[Memory]:
        """Get memories that haven't been consolidated yet."""
        db = self._get_db()
        rows = db.execute(
            "SELECT * FROM memories WHERE consolidated = 0 ORDER BY created_at DESC LIMIT ?",
            (limit,)
        ).fetchall()
        db.close()
        
        return [self._row_to_memory(r) for r in rows]
    
    def get_memory_by_id(self, memory_id: int) -> Optional[Memory]:
        """Get a specific memory by ID."""
        db = self._get_db()
        row = db.execute("SELECT * FROM memories WHERE id = ?", (memory_id,)).fetchone()
        db.close()
        
        return self._row_to_memory(row) if row else None
    
    def delete_memory(self, memory_id: int) -> dict:
        """Delete a memory by ID."""
        db = self._get_db()
        row = db.execute("SELECT 1 FROM memories WHERE id = ?", (memory_id,)).fetchone()
        
        if not row:
            db.close()
            return {"status": "not_found", "memory_id": memory_id}
        
        db.execute("DELETE FROM memories WHERE id = ?", (memory_id,))
        db.commit()
        db.close()
        
        logger.info(f"🗑️ Deleted memory #{memory_id}")
        return {"status": "deleted", "memory_id": memory_id}
    
    def search_memories(self, query: str, limit: int = 10) -> list[Memory]:
        """Search memories by text content."""
        db = self._get_db()
        rows = db.execute(
            """SELECT * FROM memories 
               WHERE summary LIKE ? OR raw_text LIKE ? OR entities LIKE ? OR topics LIKE ?
               ORDER BY importance DESC, created_at DESC LIMIT ?""",
            (f"%{query}%", f"%{query}%", f"%{query}%", f"%{query}%", limit)
        ).fetchall()
        db.close()
        
        return [self._row_to_memory(r) for r in rows]
    
    # ── Consolidation Operations ───────────────────────────────────────────────
    
    def store_consolidation(
        self,
        source_ids: list[int],
        summary: str,
        insight: str,
        connections: list[dict] = None,
    ) -> dict:
        """Store a consolidation and mark source memories as consolidated."""
        connections = connections or []
        
        db = self._get_db()
        now = datetime.now(timezone.utc).isoformat()
        
        # Store consolidation
        db.execute(
            "INSERT INTO consolidations (source_ids, summary, insight, created_at) VALUES (?, ?, ?, ?)",
            (json.dumps(source_ids), summary, insight, now),
        )
        
        # Update connections on memories
        for conn in connections:
            from_id, to_id = conn.get("from_id"), conn.get("to_id")
            rel = conn.get("relationship", "")
            if from_id and to_id:
                for mid in [from_id, to_id]:
                    row = db.execute("SELECT connections FROM memories WHERE id = ?", (mid,)).fetchone()
                    if row:
                        existing = json.loads(row["connections"])
                        existing.append({
                            "linked_to": to_id if mid == from_id else from_id,
                            "relationship": rel
                        })
                        db.execute(
                            "UPDATE memories SET connections = ? WHERE id = ?",
                            (json.dumps(existing), mid)
                        )
        
        # Mark memories as consolidated
        if source_ids:
            placeholders = ",".join("?" * len(source_ids))
            db.execute(f"UPDATE memories SET consolidated = 1 WHERE id IN ({placeholders})", source_ids)
        
        db.commit()
        db.close()
        
        logger.info(f"🔄 Consolidated {len(source_ids)} memories. Insight: {insight[:80]}...")
        return {"status": "consolidated", "memories_processed": len(source_ids), "insight": insight}
    
    def get_consolidation_history(self, limit: int = 10) -> list[Consolidation]:
        """Get past consolidation records."""
        db = self._get_db()
        rows = db.execute(
            "SELECT * FROM consolidations ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
        db.close()
        
        return [
            Consolidation(
                id=r["id"],
                source_ids=json.loads(r["source_ids"]),
                summary=r["summary"],
                insight=r["insight"],
                created_at=r["created_at"],
            )
            for r in rows
        ]
    
    # ── Stats & Utilities ──────────────────────────────────────────────────────
    
    def get_stats(self) -> MemoryStats:
        """Get memory system statistics."""
        db = self._get_db()
        total = db.execute("SELECT COUNT(*) as c FROM memories").fetchone()["c"]
        unconsolidated = db.execute(
            "SELECT COUNT(*) as c FROM memories WHERE consolidated = 0"
        ).fetchone()["c"]
        consolidations = db.execute("SELECT COUNT(*) as c FROM consolidations").fetchone()["c"]
        db.close()
        
        return MemoryStats(
            total_memories=total,
            unconsolidated=unconsolidated,
            consolidations=consolidations,
        )
    
    def clear_all(self) -> dict:
        """Delete all memories and consolidations."""
        db = self._get_db()
        mem_count = db.execute("SELECT COUNT(*) as c FROM memories").fetchone()["c"]
        db.execute("DELETE FROM memories")
        db.execute("DELETE FROM consolidations")
        db.execute("DELETE FROM processed_files")
        db.commit()
        db.close()
        
        logger.info(f"🗑️ Cleared all {mem_count} memories")
        return {"status": "cleared", "memories_deleted": mem_count}
    
    # ── Helpers ────────────────────────────────────────────────────────────────
    
    def _row_to_memory(self, row: sqlite3.Row) -> Memory:
        """Convert a database row to a Memory object."""
        return Memory(
            id=row["id"],
            source=row["source"],
            raw_text=row["raw_text"],
            summary=row["summary"],
            entities=json.loads(row["entities"]),
            topics=json.loads(row["topics"]),
            connections=json.loads(row["connections"]),
            importance=row["importance"],
            created_at=row["created_at"],
            consolidated=bool(row["consolidated"]),
        )
