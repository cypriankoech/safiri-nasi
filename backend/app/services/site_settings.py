from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SiteSetting

DEFAULTS: dict[str, Any] = {
    "company_name": "Safiri Nasi Tour & Travel",
    "tagline": "Travel with us. Discover more.",
    "email": "hello@safirinasi.co.ke",
    "phone": "+254 700 000 000",
    "whatsapp": "254700000000",
    "address": "Nairobi, Kenya",
    "office_hours": "Mon–Sat, 8:00am – 6:00pm EAT",
    "socials": {"facebook": "", "instagram": "", "tiktok": "", "x": "", "youtube": ""},
    "mpesa_paybill": "174379",
    "mpesa_till": "",
    "bank_details": {
        "bank_name": "",
        "account_name": "Safiri Nasi Tour & Travel Ltd",
        "account_number": "",
        "branch": "",
        "swift_code": "",
    },
    "usd_to_kes": 129.0,
    "default_deposit_percent": 30,
    "licences": ["Tourism Regulatory Authority (TRA) licensed"],
    "stats": {"years": 5, "travellers": 2500, "destinations": 40, "rating": 4.9},
    "announcement": "",
    "payment_methods": {"mpesa": True, "airtel": True, "card": True, "paybill": True, "bank": True},
}

PUBLIC_KEYS = set(DEFAULTS)


async def get_all(db: AsyncSession) -> dict[str, Any]:
    values = dict(DEFAULTS)
    for row in (await db.scalars(select(SiteSetting))).all():
        values[row.key] = row.value
    return values


async def get_value(db: AsyncSession, key: str) -> Any:
    row = await db.get(SiteSetting, key)
    return row.value if row else DEFAULTS.get(key)


async def set_values(db: AsyncSession, values: dict[str, Any]) -> None:
    for key, value in values.items():
        if key not in DEFAULTS:
            continue
        row = await db.get(SiteSetting, key)
        if row:
            row.value = value
        else:
            db.add(SiteSetting(key=key, value=value))


async def usd_to_kes(db: AsyncSession) -> Decimal:
    return Decimal(str(await get_value(db, "usd_to_kes")))
