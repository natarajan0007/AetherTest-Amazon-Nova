"""SQLite CRUD operations for sessions and test cases."""
import json
import uuid
from datetime import datetime, timezone
from typing import Optional, List
import aiosqlite

from ..models.session import SessionCreate, SessionRead, SessionUpdate
from ..models.test_case import TestCaseCreate, TestCaseRead, TestCaseUpdate, TestStep


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class SessionService:
    def __init__(self, db: aiosqlite.Connection):
        self.db = db

    async def create_session(self, data: SessionCreate) -> SessionRead:
        session_id = str(uuid.uuid4())
        now = _now()
        await self.db.execute(
            """INSERT INTO sessions (id, status, requirement, target_url, created_at, updated_at, metadata)
               VALUES (?, 'pending', ?, ?, ?, ?, '{}')""",
            (session_id, data.requirement, data.target_url, now, now),
        )
        await self.db.commit()
        return await self.get_session(session_id)

    async def get_session(self, session_id: str) -> Optional[SessionRead]:
        async with self.db.execute(
            "SELECT * FROM sessions WHERE id = ?", (session_id,)
        ) as cursor:
            row = await cursor.fetchone()
        if not row:
            return None
        return SessionRead(
            id=row["id"],
            status=row["status"],
            requirement=row["requirement"],
            target_url=row["target_url"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            report_id=row["report_id"],
            metadata=json.loads(row["metadata"] or "{}"),
        )

    async def list_sessions(self, limit: int = 50) -> List[SessionRead]:
        async with self.db.execute(
            "SELECT * FROM sessions ORDER BY created_at DESC LIMIT ?", (limit,)
        ) as cursor:
            rows = await cursor.fetchall()
        return [
            SessionRead(
                id=r["id"],
                status=r["status"],
                requirement=r["requirement"],
                target_url=r["target_url"],
                created_at=r["created_at"],
                updated_at=r["updated_at"],
                report_id=r["report_id"],
                metadata=json.loads(r["metadata"] or "{}"),
            )
            for r in rows
        ]

    async def update_session(self, session_id: str, update: SessionUpdate) -> Optional[SessionRead]:
        now = _now()
        updates = {"updated_at": now}
        if update.status is not None:
            updates["status"] = update.status
        if update.report_id is not None:
            updates["report_id"] = update.report_id
        if update.metadata is not None:
            updates["metadata"] = json.dumps(update.metadata)

        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [session_id]
        await self.db.execute(
            f"UPDATE sessions SET {set_clause} WHERE id = ?", values
        )
        await self.db.commit()
        return await self.get_session(session_id)

    # Test cases

    async def create_test_case(self, data: TestCaseCreate) -> TestCaseRead:
        tc_id = str(uuid.uuid4())
        now = _now()
        await self.db.execute(
            """INSERT INTO test_cases (id, session_id, title, description, steps, expected, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)""",
            (
                tc_id,
                data.session_id,
                data.title,
                data.description,
                json.dumps([s.model_dump() for s in data.steps]),
                data.expected,
                now,
                now,
            ),
        )
        await self.db.commit()
        return await self.get_test_case(tc_id)

    async def get_test_case(self, tc_id: str) -> Optional[TestCaseRead]:
        async with self.db.execute(
            "SELECT * FROM test_cases WHERE id = ?", (tc_id,)
        ) as cursor:
            row = await cursor.fetchone()
        if not row:
            return None
        return TestCaseRead(
            id=row["id"],
            session_id=row["session_id"],
            title=row["title"],
            description=row["description"],
            steps=[TestStep(**s) for s in json.loads(row["steps"] or "[]")],
            expected=row["expected"],
            status=row["status"],
            evidence=row["evidence"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    async def list_test_cases(self, session_id: str) -> List[TestCaseRead]:
        async with self.db.execute(
            "SELECT * FROM test_cases WHERE session_id = ? ORDER BY created_at", (session_id,)
        ) as cursor:
            rows = await cursor.fetchall()
        return [
            TestCaseRead(
                id=r["id"],
                session_id=r["session_id"],
                title=r["title"],
                description=r["description"],
                steps=[TestStep(**s) for s in json.loads(r["steps"] or "[]")],
                expected=r["expected"],
                status=r["status"],
                evidence=r["evidence"],
                created_at=r["created_at"],
                updated_at=r["updated_at"],
            )
            for r in rows
        ]

    async def update_test_case(self, tc_id: str, update: TestCaseUpdate) -> Optional[TestCaseRead]:
        now = _now()
        updates: dict = {"updated_at": now}
        if update.status is not None:
            updates["status"] = update.status
        if update.evidence is not None:
            updates["evidence"] = update.evidence
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [tc_id]
        await self.db.execute(f"UPDATE test_cases SET {set_clause} WHERE id = ?", values)
        await self.db.commit()
        return await self.get_test_case(tc_id)
