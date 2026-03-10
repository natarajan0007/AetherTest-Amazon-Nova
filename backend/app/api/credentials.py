"""Credential store/retrieve API (encrypted with Fernet)."""
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import aiosqlite

from ..database import get_db
from ..config import get_settings

router = APIRouter(prefix="/api/credentials", tags=["credentials"])
settings = get_settings()


def _get_fernet():
    from cryptography.fernet import Fernet
    key = settings.credential_encryption_key
    if not key or key == "your-fernet-key-here":
        raise HTTPException(500, "CREDENTIAL_ENCRYPTION_KEY not configured in .env")
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except Exception as e:
        raise HTTPException(500, f"Invalid CREDENTIAL_ENCRYPTION_KEY: {e}")


class CredentialCreate(BaseModel):
    name: str
    username: str
    password: str
    extra: Optional[dict] = None


class CredentialRead(BaseModel):
    id: str
    name: str
    created_at: str


@router.post("", response_model=CredentialRead, status_code=201)
async def store_credential(data: CredentialCreate, db: aiosqlite.Connection = Depends(get_db)):
    fernet = _get_fernet()
    import json
    payload = json.dumps({
        "username": data.username,
        "password": data.password,
        "extra": data.extra or {},
    })
    encrypted = fernet.encrypt(payload.encode()).decode()
    cred_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    try:
        await db.execute(
            "INSERT INTO credentials (id, name, encrypted, created_at) VALUES (?, ?, ?, ?)",
            (cred_id, data.name, encrypted, now),
        )
        await db.commit()
    except Exception as e:
        if "UNIQUE" in str(e):
            # Update existing
            await db.execute(
                "UPDATE credentials SET encrypted = ? WHERE name = ?",
                (encrypted, data.name),
            )
            await db.commit()
            async with db.execute("SELECT id, created_at FROM credentials WHERE name = ?", (data.name,)) as cur:
                row = await cur.fetchone()
            return CredentialRead(id=row["id"], name=data.name, created_at=row["created_at"])
        raise
    return CredentialRead(id=cred_id, name=data.name, created_at=now)


@router.get("/{name}", response_model=CredentialRead)
async def get_credential_meta(name: str, db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute("SELECT id, name, created_at FROM credentials WHERE name = ?", (name,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Credential not found")
    return CredentialRead(id=row["id"], name=row["name"], created_at=row["created_at"])


@router.delete("/{name}", status_code=204)
async def delete_credential(name: str, db: aiosqlite.Connection = Depends(get_db)):
    await db.execute("DELETE FROM credentials WHERE name = ?", (name,))
    await db.commit()


async def lookup_credential(db: aiosqlite.Connection, name: str) -> dict | None:
    """Internal helper: decrypt and return credential dict."""
    async with db.execute("SELECT encrypted FROM credentials WHERE name = ?", (name,)) as cur:
        row = await cur.fetchone()
    if not row:
        return None
    fernet = _get_fernet()
    import json
    payload = fernet.decrypt(row["encrypted"].encode()).decode()
    return json.loads(payload)
