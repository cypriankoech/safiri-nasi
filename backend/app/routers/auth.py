from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Cookie, HTTPException, Response, status
from sqlalchemy import func, select, update

from app.config import settings
from app.deps import ACCESS_COOKIE, DB, REFRESH_COOKIE, CurrentUser, OptionalUser
from app.models import Booking, User
from app.schemas.auth import LoginIn, PasswordChange, ProfileUpdate, RegisterIn, UserOut
from app.schemas.common import Message
from app.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_session(response: Response, user: User) -> None:
    common = {
        "httponly": True,
        "secure": settings.cookie_secure,
        "samesite": "lax",
        "domain": settings.cookie_domain,
    }
    response.set_cookie(
        ACCESS_COOKIE,
        create_access_token(user.id, user.role),
        max_age=settings.access_token_minutes * 60,
        path="/",
        **common,
    )
    response.set_cookie(
        REFRESH_COOKIE,
        create_refresh_token(user.id, user.token_version),
        max_age=settings.refresh_token_days * 86400,
        path="/api/auth",
        **common,
    )


def _clear_session(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/", domain=settings.cookie_domain)
    response.delete_cookie(REFRESH_COOKIE, path="/api/auth", domain=settings.cookie_domain)


async def _link_guest_bookings(db: DB, user: User) -> None:
    """Bookings made as a guest with this email become visible in the new account."""
    await db.execute(
        update(Booking)
        .where(func.lower(Booking.contact_email) == user.email.lower(), Booking.user_id.is_(None))
        .values(user_id=user.id)
    )


@router.post("/register", response_model=UserOut, status_code=201)
async def register(data: RegisterIn, db: DB, response: Response):
    email = data.email.lower()
    if await db.scalar(select(User.id).where(func.lower(User.email) == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")
    user = User(
        email=email,
        full_name=data.full_name,
        phone=data.phone,
        country=data.country,
        password_hash=hash_password(data.password),
        last_login_at=datetime.now(UTC),
    )
    db.add(user)
    await db.flush()
    await _link_guest_bookings(db, user)
    await db.commit()
    await db.refresh(user)
    _set_session(response, user)
    return user


@router.post("/login", response_model=UserOut)
async def login(data: LoginIn, db: DB, response: Response):
    user = await db.scalar(select(User).where(func.lower(User.email) == data.email.lower()))
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password.")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated.")
    user.last_login_at = datetime.now(UTC)
    await _link_guest_bookings(db, user)
    await db.commit()
    await db.refresh(user)
    _set_session(response, user)
    return user


@router.post("/refresh", response_model=UserOut)
async def refresh(db: DB, response: Response, sn_refresh: Annotated[str | None, Cookie()] = None):
    payload = decode_token(sn_refresh or "", "refresh")
    user = await db.get(User, int(payload["sub"])) if payload else None
    if not user or not user.is_active or payload.get("ver") != user.token_version:
        _clear_session(response)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Please log in again.")
    _set_session(response, user)
    return user


@router.post("/logout", response_model=Message)
async def logout(response: Response):
    _clear_session(response)
    return Message(message="Logged out")


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser):
    return user


@router.patch("/me", response_model=UserOut)
async def update_me(data: ProfileUpdate, user: CurrentUser, db: DB):
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/change-password", response_model=Message)
async def change_password(data: PasswordChange, user: CurrentUser, db: DB, response: Response):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect.")
    user.password_hash = hash_password(data.new_password)
    user.token_version += 1  # sign out other devices
    await db.commit()
    await db.refresh(user)
    _set_session(response, user)
    return Message(message="Password updated")


@router.get("/session", response_model=UserOut | None)
async def session(
    db: DB, response: Response, user: OptionalUser, sn_refresh: Annotated[str | None, Cookie()] = None
):
    """Current user or null (never 401), renewing an expired access token from the refresh cookie."""
    if user:
        return user
    payload = decode_token(sn_refresh or "", "refresh")
    if not payload:
        return None
    user = await db.get(User, int(payload["sub"]))
    if not user or not user.is_active or payload.get("ver") != user.token_version:
        _clear_session(response)
        return None
    _set_session(response, user)
    return user
