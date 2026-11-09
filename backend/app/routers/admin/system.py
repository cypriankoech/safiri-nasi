import secrets
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request, UploadFile, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.config import settings
from app.deps import DB, AdminUser, StaffUser, client_ip
from app.models import AuditLog, User
from app.models.enums import Role
from app.payments.base import ProviderError
from app.payments.mpesa import DarajaClient
from app.schemas.auth import UserOut
from app.schemas.common import ORM, Message
from app.security import hash_password
from app.services import site_settings
from app.services.audit import log_action

router = APIRouter()

ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/avif": ".avif",
}


# --- Staff users ------------------------------------------------------------------


class StaffCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    password: str = Field(min_length=8)
    phone: str | None = None
    role: Role = Role.staff


class UserUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    role: Role | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8)


@router.get("/users", response_model=list[UserOut])
async def list_users(db: DB, _: AdminUser, role: str | None = None, q: str | None = None):
    stmt = select(User).order_by(User.role, User.full_name)
    if role:
        stmt = stmt.where(User.role.in_(role.split(",")))
    if q:
        stmt = stmt.where(User.email.ilike(f"%{q}%") | User.full_name.ilike(f"%{q}%"))
    return (await db.scalars(stmt.limit(500))).all()


@router.get("/staff", response_model=list[UserOut])
async def list_staff(db: DB, _: StaffUser):
    """Staff list for assignment dropdowns (available to all staff)."""
    return (
        await db.scalars(
            select(User)
            .where(User.role.in_([Role.staff, Role.admin]), User.is_active.is_(True))
            .order_by(User.full_name)
        )
    ).all()


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(data: StaffCreate, db: DB, admin: AdminUser, request: Request):
    if await db.scalar(select(User.id).where(func.lower(User.email) == data.email.lower())):
        raise HTTPException(status.HTTP_409_CONFLICT, "A user with this email already exists.")
    user = User(
        full_name=data.full_name,
        email=data.email.lower(),
        phone=data.phone,
        role=data.role,
        password_hash=hash_password(data.password),
    )
    db.add(user)
    await db.flush()
    log_action(
        db, admin, "user.create", "user", user.id, f"{user.email} as {user.role}", ip=client_ip(request)
    )
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(user_id: int, data: UserUpdate, db: DB, admin: AdminUser, request: Request):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.id == admin.id and (data.role not in (None, Role.admin) or data.is_active is False):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't demote or deactivate yourself.")
    changes = data.model_dump(exclude_unset=True, exclude={"password"})
    for k, v in changes.items():
        setattr(user, k, v)
    if data.password:
        user.password_hash = hash_password(data.password)
        user.token_version += 1
        changes["password"] = "reset"
    if data.is_active is False or "role" in changes:
        user.token_version += 1
    log_action(
        db,
        admin,
        "user.update",
        "user",
        user.id,
        user.email,
        {k: str(v) for k, v in changes.items()},
        ip=client_ip(request),
    )
    await db.commit()
    await db.refresh(user)
    return user


# --- Settings ---------------------------------------------------------------------


@router.get("/settings")
async def get_settings(db: DB, _: StaffUser):
    return await site_settings.get_all(db)


@router.put("/settings")
async def update_settings(values: dict[str, Any], db: DB, admin: AdminUser, request: Request):
    unknown = set(values) - set(site_settings.DEFAULTS)
    if unknown:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown settings: {', '.join(sorted(unknown))}"
        )
    if "usd_to_kes" in values:
        try:
            rate = float(values["usd_to_kes"])
        except (TypeError, ValueError):
            rate = 0
        if not 50 <= rate <= 500:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "USD→KES rate looks wrong.")
        values["usd_to_kes"] = rate
    await site_settings.set_values(db, values)
    log_action(
        db, admin, "settings.update", "settings", None, ", ".join(sorted(values)), ip=client_ip(request)
    )
    await db.commit()
    return await site_settings.get_all(db)


@router.get("/payment-config")
async def payment_config(_: StaffUser):
    """Which providers are configured, and the callback URLs to register with each."""
    base = settings.public_api_url
    secret = settings.callback_secret
    split = {
        "partner": settings.platform_partner_name,
        "percent": float(settings.paystack_platform_percent),
        "subaccount": settings.paystack_platform_subaccount or "not set",
        "paystack_fee_paid_by": "Safiri Nasi (main account)",
        "active": bool(settings.paystack_platform_subaccount) and settings.paystack_platform_percent > 0,
    }
    direct = {
        "mpesa": {
            "configured": bool(settings.mpesa_consumer_key and settings.mpesa_consumer_secret),
            "shortcode": settings.mpesa_shortcode,
            "transaction_type": settings.mpesa_transaction_type,
            "stk_callback_url": f"{base}/api/callbacks/mpesa/stk/{secret[:4]}…",
            "c2b_confirmation_url": f"{base}/api/callbacks/mpesa/c2b/confirmation/{secret[:4]}…",
        },
        "airtel": {
            "configured": bool(settings.airtel_client_id and settings.airtel_client_secret),
            "callback_url": f"{base}/api/callbacks/airtel/{secret[:4]}…",
            "callback_signing": bool(settings.airtel_callback_secret),
        },
        "card": {
            "provider": "DPO Pay",
            "configured": bool(settings.dpo_company_token and settings.dpo_service_type),
            "push_url": f"{base}/api/callbacks/dpo/{secret[:4]}…",
        },
    }
    paystack = {
        "paystack": {
            "configured": bool(settings.paystack_secret_key),
            "key_type": "live" if settings.paystack_secret_key.startswith("sk_live") else "test",
            "channels": "M-Pesa, Airtel Money, card",
            "webhook_url": f"{base}/api/callbacks/paystack",
        }
    }
    return {
        "mode": settings.payments_mode,
        "gateway": settings.payment_gateway,
        "public_api_url": base,
        "split": split if settings.payment_gateway == "paystack" else None,
        "providers": paystack if settings.payment_gateway == "paystack" else direct,
    }


@router.post("/payment-config/register-c2b", response_model=Message)
async def register_c2b(admin: AdminUser, db: DB):
    """Tell Safaricom where to send Paybill/Till payments made outside our checkout."""
    if settings.payments_mode == "mock" or settings.payment_gateway != "direct":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only available with the direct M-Pesa integration.")
    base = f"{settings.public_api_url}/api/callbacks/mpesa/c2b"
    try:
        data = await DarajaClient().register_c2b_urls(
            f"{base}/confirmation/{settings.callback_secret}", f"{base}/validation/{settings.callback_secret}"
        )
    except ProviderError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    log_action(db, admin, "mpesa.register_c2b", "settings", None, str(data.get("ResponseDescription")))
    await db.commit()
    if str(data.get("ResponseCode", "")) not in ("0", "00000000"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, data.get("errorMessage") or str(data))
    return Message(message=data.get("ResponseDescription") or "C2B URLs registered")


# --- Audit log --------------------------------------------------------------------


class AuditOut(ORM):
    id: int
    user_name: str | None = None
    action: str
    entity: str
    entity_id: str | None
    summary: str | None
    details: dict
    ip: str | None
    created_at: datetime


@router.get("/audit", response_model=list[AuditOut])
async def audit_log(
    db: DB, _: AdminUser, entity: str | None = None, q: str | None = None, limit: int = Query(200, le=1000)
):
    stmt = select(AuditLog).options(selectinload(AuditLog.user)).order_by(AuditLog.created_at.desc())
    if entity:
        stmt = stmt.where(AuditLog.entity == entity)
    if q:
        stmt = stmt.where(AuditLog.summary.ilike(f"%{q}%") | AuditLog.entity_id.ilike(f"%{q}%"))
    rows = []
    for a in (await db.scalars(stmt.limit(limit))).all():
        item = AuditOut.model_validate(a)
        item.user_name = a.user.full_name if a.user else "System"
        rows.append(item)
    return rows


# --- Uploads ----------------------------------------------------------------------


@router.post("/uploads")
async def upload_image(file: UploadFile, user: StaffUser, db: DB):
    ext = ALLOWED_IMAGE_TYPES.get(file.content_type or "")
    if not ext:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Upload a JPG, PNG, WebP or AVIF image.")
    data = await file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"Images must be under {settings.max_upload_mb} MB."
        )
    folder = datetime.now().strftime("%Y/%m")
    target_dir = Path(settings.upload_dir) / folder
    target_dir.mkdir(parents=True, exist_ok=True)
    stem = Path(file.filename or "image").stem[:40].replace(" ", "-") or "image"
    name = f"{stem}-{secrets.token_hex(4)}{ext}"
    (target_dir / name).write_bytes(data)
    log_action(db, user, "upload.create", "upload", None, f"{folder}/{name}")
    await db.commit()
    # Relative, so the website serves it through its /uploads rewrite (works in and out of Docker).
    return {"url": f"/uploads/{folder}/{name}"}
