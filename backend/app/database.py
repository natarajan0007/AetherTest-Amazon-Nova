"""SQLite database initialization and connection management."""
import os
import aiosqlite
from .config import get_settings

settings = get_settings()

# Extract filesystem path from sqlite:/// URL
_db_path = settings.database_url.replace("sqlite:///", "")


async def get_db() -> aiosqlite.Connection:
    """Yield a database connection (use as async context manager)."""
    os.makedirs(os.path.dirname(os.path.abspath(_db_path)), exist_ok=True)
    conn = await aiosqlite.connect(_db_path)
    conn.row_factory = aiosqlite.Row
    try:
        yield conn
    finally:
        await conn.close()


async def init_db() -> None:
    """Create all tables if they do not exist."""
    os.makedirs(os.path.dirname(os.path.abspath(_db_path)), exist_ok=True)
    async with aiosqlite.connect(_db_path) as db:
        db.row_factory = aiosqlite.Row
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                id          TEXT PRIMARY KEY,
                status      TEXT NOT NULL DEFAULT 'pending',
                requirement TEXT NOT NULL,
                target_url  TEXT NOT NULL,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL,
                report_id   TEXT,
                metadata    TEXT DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS test_cases (
                id          TEXT PRIMARY KEY,
                session_id  TEXT NOT NULL,
                title       TEXT NOT NULL,
                description TEXT,
                steps       TEXT NOT NULL DEFAULT '[]',
                expected    TEXT,
                status      TEXT NOT NULL DEFAULT 'pending',
                evidence    TEXT,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            );

            CREATE TABLE IF NOT EXISTS credentials (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL UNIQUE,
                encrypted   TEXT NOT NULL,
                created_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS reports (
                id          TEXT PRIMARY KEY,
                session_id  TEXT NOT NULL UNIQUE,
                data        TEXT NOT NULL DEFAULT '{}',
                file_path   TEXT,
                created_at  TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            );
        """)
        await db.commit()
