"""
Stage 4 — Auth helpers (minimal JWT + password hashing).

No registration / password-reset flow yet — seed user only for local login.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db.models import User
from app.db.session import get_db

_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    # bcrypt backend rejects >72 bytes; keep explicit for clear errors
    pwd_bytes = password[:72].encode("utf-8")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain[:72].encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(
    *,
    subject: str,
    role: str,
    settings: Settings | None = None,
) -> str:
    settings = settings or get_settings()
    expire = datetime.now(UTC) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": subject, "role": role, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        user_id: str | None = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def require_parent(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role not in ("parent", "internal"):
        raise HTTPException(status_code=403, detail="Parent role required")
    return user


async def require_internal(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role not in ("internal", "clinician"):
        raise HTTPException(status_code=403, detail="Internal role required")
    return user


async def require_worker(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role not in ("chw", "supervisor", "internal"):
        raise HTTPException(status_code=403, detail="Community Health Worker or Supervisor role required")
    return user


async def require_supervisor(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role not in ("supervisor", "internal"):
        raise HTTPException(status_code=403, detail="Supervisor role required")
    return user
