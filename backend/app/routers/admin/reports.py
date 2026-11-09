import csv
import io
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.config import settings
from app.deps import DB, StaffUser
from app.models import Booking, Departure, Enquiry, Payment, Review, UnmatchedPayment
from app.models.enums import BookingStatus, Currency, EnquiryStatus, PaymentStatus, ReviewStatus
from app.services import site_settings
from app.services.booking import CLOSED_STATUSES

router = APIRouter()


def _kes(amount: Decimal, currency: str, fx: Decimal) -> float:
    return float(amount * fx if currency == Currency.USD else amount)


def _month_start(d: date) -> date:
    return d.replace(day=1)


def _dt(d: date) -> datetime:
    return datetime.combine(d, datetime.min.time(), UTC)


async def _paid(db: DB, start: datetime, end: datetime) -> list[Payment]:
    return list(
        (
            await db.scalars(
                select(Payment)
                .where(
                    Payment.status == PaymentStatus.success, Payment.paid_at >= start, Payment.paid_at < end
                )
                .options(selectinload(Payment.booking).selectinload(Booking.tour))
            )
        ).all()
    )


@router.get("/dashboard")
async def dashboard(db: DB, _: StaffUser):
    fx = await site_settings.usd_to_kes(db)
    today = date.today()
    this_month = _month_start(today)
    last_month = _month_start(this_month - timedelta(days=1))
    year_ago = _month_start(date(today.year - 1, today.month, 1) + timedelta(days=32))

    payments = await _paid(db, _dt(year_ago), _dt(today + timedelta(days=1)))
    by_month: dict[str, float] = defaultdict(float)
    by_method: dict[str, float] = defaultdict(float)
    by_tour: dict[str, float] = defaultdict(float)
    revenue_this, revenue_last = 0.0, 0.0
    for p in payments:
        kes = _kes(p.amount, p.currency, fx)
        paid_day = p.paid_at.date()
        by_month[paid_day.strftime("%Y-%m")] += kes
        if paid_day >= this_month:
            revenue_this += kes
            by_method[p.method] += kes
        elif paid_day >= last_month:
            revenue_last += kes
        if paid_day >= today - timedelta(days=90):
            by_tour[p.booking.tour.title] += kes

    months = []
    cursor = year_ago
    while cursor <= this_month:
        key = cursor.strftime("%Y-%m")
        months.append(
            {"month": key, "label": cursor.strftime("%b %y"), "kes": round(by_month.get(key, 0), 2)}
        )
        cursor = _month_start(cursor + timedelta(days=32))

    open_bookings = (
        await db.scalars(
            select(Booking).where(Booking.status == BookingStatus.confirmed, Booking.balance > 0)
        )
    ).all()
    outstanding = sum(_kes(b.balance, b.currency, fx) for b in open_bookings)
    overdue = sum(1 for b in open_bookings if b.balance_due_date and b.balance_due_date < today)

    counts = {
        "bookings_this_month": await db.scalar(
            select(func.count()).where(
                Booking.created_at >= _dt(this_month), Booking.status.not_in([BookingStatus.expired])
            )
        ),
        "pending_payment": await db.scalar(
            select(func.count()).where(Booking.status == BookingStatus.pending_payment)
        ),
        "new_enquiries": await db.scalar(select(func.count()).where(Enquiry.status == EnquiryStatus.new)),
        "unmatched_payments": await db.scalar(
            select(func.count()).where(UnmatchedPayment.resolved.is_(False))
        ),
        "pending_reviews": await db.scalar(select(func.count()).where(Review.status == ReviewStatus.pending)),
        "travellers_next_30": await db.scalar(
            select(func.coalesce(func.sum(Booking.adults + Booking.children), 0)).where(
                Booking.travel_date >= today,
                Booking.travel_date <= today + timedelta(days=30),
                Booking.status.in_([BookingStatus.confirmed, BookingStatus.fully_paid]),
            )
        ),
    }

    upcoming = (
        await db.scalars(
            select(Departure)
            .where(Departure.start_date >= today, Departure.status != "cancelled")
            .options(selectinload(Departure.tour))
            .order_by(Departure.start_date)
            .limit(8)
        )
    ).all()
    recent_bookings = (
        await db.scalars(
            select(Booking).options(selectinload(Booking.tour)).order_by(Booking.created_at.desc()).limit(8)
        )
    ).all()
    recent_payments = (
        await db.scalars(
            select(Payment)
            .options(selectinload(Payment.booking))
            .order_by(Payment.created_at.desc())
            .limit(8)
        )
    ).all()

    return {
        "fx_usd_kes": float(fx),
        "kpis": {
            "revenue_this_month": round(revenue_this, 2),
            "revenue_last_month": round(revenue_last, 2),
            "outstanding_balances": round(outstanding, 2),
            "overdue_balances": overdue,
            **counts,
        },
        "revenue_by_month": months,
        "revenue_by_method": [
            {"method": k, "kes": round(v, 2)} for k, v in sorted(by_method.items(), key=lambda x: -x[1])
        ],
        "top_tours": [
            {"tour": k, "kes": round(v, 2)} for k, v in sorted(by_tour.items(), key=lambda x: -x[1])[:5]
        ],
        "upcoming_departures": [
            {
                "id": d.id,
                "tour": d.tour.title,
                "tour_id": d.tour_id,
                "start_date": d.start_date,
                "capacity": d.capacity,
                "seats_booked": d.seats_booked,
                "status": d.status,
            }
            for d in upcoming
        ],
        "recent_bookings": [
            {
                "reference": b.reference,
                "tour": b.tour.title,
                "contact_name": b.contact_name,
                "status": b.status,
                "total": float(b.total),
                "currency": b.currency,
                "created_at": b.created_at,
            }
            for b in recent_bookings
        ],
        "recent_payments": [
            {
                "reference": p.reference,
                "booking_reference": p.booking.reference,
                "method": p.method,
                "amount": float(p.amount),
                "currency": p.currency,
                "status": p.status,
                "created_at": p.created_at,
            }
            for p in recent_payments
        ],
    }


@router.get("/reports/revenue")
async def revenue_report(
    db: DB,
    _: StaffUser,
    date_from: date | None = None,
    date_to: date | None = None,
    group: Literal["day", "week", "month"] = "month",
):
    fx = await site_settings.usd_to_kes(db)
    date_to = date_to or date.today()
    date_from = date_from or date_to - timedelta(days=365)
    payments = await _paid(db, _dt(date_from), _dt(date_to + timedelta(days=1)))

    def bucket(d: date) -> str:
        if group == "day":
            return d.isoformat()
        if group == "week":
            return (d - timedelta(days=d.weekday())).isoformat()
        return d.strftime("%Y-%m")

    series: dict[str, float] = defaultdict(float)
    by_method: dict[str, dict] = defaultdict(lambda: {"count": 0, "kes": 0.0})
    by_tour: dict[str, dict] = defaultdict(lambda: {"count": 0, "kes": 0.0})
    by_currency: dict[str, float] = defaultdict(float)
    fees_kes = partner_kes = 0.0
    for p in payments:
        kes = _kes(p.amount, p.currency, fx)
        fees_kes += _kes(p.gateway_fee or Decimal(0), p.currency, fx)
        partner_kes += _kes(p.platform_share or Decimal(0), p.currency, fx)
        series[bucket(p.paid_at.date())] += kes
        by_method[p.method]["count"] += 1
        by_method[p.method]["kes"] += kes
        by_tour[p.booking.tour.title]["count"] += 1
        by_tour[p.booking.tour.title]["kes"] += kes
        by_currency[p.currency] += float(p.amount)
    return {
        "date_from": date_from,
        "date_to": date_to,
        "fx_usd_kes": float(fx),
        "total_kes": round(sum(series.values()), 2),
        "gateway_fees_kes": round(fees_kes, 2),
        "partner_share_kes": round(partner_kes, 2),
        "partner_name": settings.platform_partner_name,
        "net_kes": round(sum(series.values()) - fees_kes - partner_kes, 2),
        "payments": len(payments),
        "series": [{"period": k, "kes": round(v, 2)} for k, v in sorted(series.items())],
        "by_method": [{"method": k, **v} for k, v in sorted(by_method.items(), key=lambda x: -x[1]["kes"])],
        "by_tour": [{"tour": k, **v} for k, v in sorted(by_tour.items(), key=lambda x: -x[1]["kes"])],
        "by_currency": by_currency,
    }


@router.get("/reports/bookings")
async def bookings_report(db: DB, _: StaffUser, date_from: date | None = None, date_to: date | None = None):
    date_to = date_to or date.today()
    date_from = date_from or date_to - timedelta(days=365)
    bookings = (
        await db.scalars(
            select(Booking)
            .where(
                Booking.created_at >= _dt(date_from), Booking.created_at < _dt(date_to + timedelta(days=1))
            )
            .options(selectinload(Booking.tour))
        )
    ).all()
    by_status: dict[str, int] = defaultdict(int)
    by_source: dict[str, int] = defaultdict(int)
    by_rate: dict[str, int] = defaultdict(int)
    by_tour: dict[str, int] = defaultdict(int)
    lead_days = []
    travellers = 0
    for b in bookings:
        by_status[b.status] += 1
        by_source[b.source] += 1
        by_rate[b.rate_category] += 1
        if b.status not in CLOSED_STATUSES:
            by_tour[b.tour.title] += 1
            travellers += b.pax
            lead_days.append((b.travel_date - b.created_at.date()).days)
    converted = sum(by_status[s] for s in ("confirmed", "fully_paid", "completed"))
    return {
        "date_from": date_from,
        "date_to": date_to,
        "total": len(bookings),
        "travellers": travellers,
        "conversion_rate": round(converted / len(bookings), 3) if bookings else None,
        "avg_lead_days": round(sum(lead_days) / len(lead_days), 1) if lead_days else None,
        "by_status": by_status,
        "by_source": by_source,
        "by_rate_category": by_rate,
        "by_tour": sorted(({"tour": k, "count": v} for k, v in by_tour.items()), key=lambda x: -x["count"]),
    }


@router.get("/reports/bookings.csv")
async def bookings_csv(db: DB, _: StaffUser, date_from: date | None = None, date_to: date | None = None):
    stmt = select(Booking).options(selectinload(Booking.tour)).order_by(Booking.created_at)
    if date_from:
        stmt = stmt.where(Booking.created_at >= _dt(date_from))
    if date_to:
        stmt = stmt.where(Booking.created_at < _dt(date_to + timedelta(days=1)))
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "Created",
            "Reference",
            "Status",
            "Tour",
            "Travel date",
            "Adults",
            "Children",
            "Rate",
            "Customer",
            "Email",
            "Phone",
            "Country",
            "Currency",
            "Total",
            "Paid",
            "Balance",
            "Balance due",
            "Source",
            "Promo",
        ]
    )
    for b in (await db.scalars(stmt)).all():
        writer.writerow(
            [
                b.created_at.date(),
                b.reference,
                b.status,
                b.tour.title,
                b.travel_date,
                b.adults,
                b.children,
                b.rate_category,
                b.contact_name,
                b.contact_email,
                b.contact_phone,
                b.contact_country or "",
                b.currency,
                b.total,
                b.amount_paid,
                b.balance,
                b.balance_due_date or "",
                b.source,
                b.promo_code or "",
            ]
        )
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="safiri-nasi-bookings.csv"'},
    )
