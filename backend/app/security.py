from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt

from app.config import settings

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def _encode(payload: dict[str, Any], expires: timedelta) -> str:
    now = datetime.now(UTC)
    return jwt.encode({**payload, "iat": now, "exp": now + expires}, settings.secret_key, ALGORITHM)


def decode_token(token: str, expected_type: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("typ") != expected_type:
        return None
    return payload


def create_access_token(user_id: int, role: str) -> str:
    return _encode(
        {"sub": str(user_id), "role": role, "typ": "access"},
        timedelta(minutes=settings.access_token_minutes),
    )


def create_refresh_token(user_id: int, token_version: int) -> str:
    return _encode(
        {"sub": str(user_id), "ver": token_version, "typ": "refresh"},
        timedelta(days=settings.refresh_token_days),
    )


def create_booking_token(reference: str) -> str:
    """Grants a guest access to one booking (sent in emails, returned after checkout)."""
    return _encode({"ref": reference, "typ": "booking"}, timedelta(days=settings.booking_token_days))
