from typing import Annotated

from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import Booking, User
from app.models.enums import Role
from app.security import decode_token

DB = Annotated[AsyncSession, Depends(get_db)]

ACCESS_COOKIE = "sn_access"
REFRESH_COOKIE = "sn_refresh"


def _bearer(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:]
    return None


async def get_current_user_optional(
    db: DB,
    authorization: Annotated[str | None, Header()] = None,
    sn_access: Annotated[str | None, Cookie()] = None,
) -> User | None:
    token = _bearer(authorization) or sn_access
    if not token:
        return None
    payload = decode_token(token, "access")
    if not payload:
        return None
    user = await db.get(User, int(payload["sub"]))
    if not user or not user.is_active:
        return None
    return user


OptionalUser = Annotated[User | None, Depends(get_current_user_optional)]


async def get_current_user(user: OptionalUser) -> User:
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def require_staff(user: CurrentUser) -> User:
    if not user.is_staff:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Staff access required")
    return user


async def require_admin(user: CurrentUser) -> User:
    if user.role != Role.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user


StaffUser = Annotated[User, Depends(require_staff)]
AdminUser = Annotated[User, Depends(require_admin)]


def can_access_booking(booking: Booking, user: User | None, booking_token: str | None) -> bool:
    if user and (user.is_staff or booking.user_id == user.id):
        return True
    if user and user.email.lower() == booking.contact_email.lower():
        return True
    if booking_token:
        payload = decode_token(booking_token, "booking")
        if payload and payload.get("ref") == booking.reference:
            return True
    return False


def client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None
