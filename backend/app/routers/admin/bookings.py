import csv
import io
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.deps import DB, StaffUser, client_ip
from app.models import Booking, Departure, Payment, Tour, Traveller, UnmatchedPayment
from app.models.enums import BookingStatus, Currency, PaymentMethod, PaymentStatus
from app.schemas.booking import BookingOut, PaymentOut, QuoteRequest, TravellerIn
from app.schemas.common import ORM, Message, Money, Page
from app.security import create_booking_token
from app.services import notifications, site_settings
from app.services.audit import log_action
from app.services.booking import cancel_booking, create_booking, get_booking, recalculate_payments
from app.services.payments import PaymentError, record_payment, refresh_payment
from app.services.pricing import QuoteError, build_quote

router = APIRouter()


class BookingRow(ORM):
    reference: str
    status: str
    tour_title: str = ""
    travel_date: date
    adults: int
    children: int
    contact_name: str
    contact_email: str
    contact_phone: str
    currency: str
    total: Money
    amount_paid: Money
    balance: Money
    balance_due_date: date | None
    source: str
    created_at: datetime


class AdminPayment(PaymentOut):
    provider_reference: str | None
    recorded_by_name: str | None = None
    fx_rate: Money


class AdminBooking(BookingOut):
    internal_notes: str | None
    source: str
    cancellation_reason: str | None
    cancelled_at: datetime | None
    reminders_sent: list
    user_id: int | None
    payments: list[AdminPayment]  # type: ignore[assignment]
    departure_status: str | None = None
    manage_url: str = ""


async def _admin_booking(db: DB, reference: str) -> AdminBooking:
    booking = await get_booking(db, reference)
    if not booking:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    payments = (
        await db.scalars(
            select(Payment)
            .where(Payment.booking_id == booking.id)
            .options(selectinload(Payment.recorded_by))
            .order_by(Payment.created_at)
        )
    ).all()
    out = AdminBooking.model_validate(booking)
    out.payments = []
    for p in payments:
        item = AdminPayment.model_validate(p)
        item.recorded_by_name = p.recorded_by.full_name if p.recorded_by else None
        out.payments.append(item)
    out.departure_status = booking.departure.status if booking.departure else None
    out.manage_url = notifications.manage_url(booking)
    return out


@router.get("/bookings", response_model=Page[BookingRow])
async def list_bookings(
    db: DB,
    _: StaffUser,
    q: str | None = None,
    status_: str | None = Query(None, alias="status"),
    tour_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    balance_due: bool = False,
    sort: Literal["created", "travel"] = "created",
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
):
    stmt = select(Booking).join(Tour)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Booking.reference.ilike(like),
                Booking.contact_name.ilike(like),
                Booking.contact_email.ilike(like),
                Booking.contact_phone.ilike(like),
                Tour.title.ilike(like),
            )
        )
    if status_:
        stmt = stmt.where(Booking.status.in_(status_.split(",")))
    if tour_id:
        stmt = stmt.where(Booking.tour_id == tour_id)
    if date_from:
        stmt = stmt.where(Booking.travel_date >= date_from)
    if date_to:
        stmt = stmt.where(Booking.travel_date <= date_to)
    if balance_due:
        stmt = stmt.where(Booking.balance > 0, Booking.status == BookingStatus.confirmed)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    order = Booking.created_at.desc() if sort == "created" else Booking.travel_date.asc()
    rows = (
        await db.scalars(
            stmt.options(selectinload(Booking.tour))
            .order_by(order)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    items = []
    for b in rows:
        row = BookingRow.model_validate(b)
        row.tour_title = b.tour.title
        items.append(row)
    return Page(items=items, total=total or 0, page=page, page_size=page_size)


@router.get("/bookings/{reference}", response_model=AdminBooking)
async def get_booking_detail(reference: str, db: DB, _: StaffUser):
    return await _admin_booking(db, reference)


class AdminBookingCreate(QuoteRequest):
    contact_name: str = Field(min_length=2)
    contact_email: EmailStr
    contact_phone: str = Field(min_length=7)
    contact_country: str | None = None
    travellers: list[TravellerIn] = []
    special_requests: str | None = None
    internal_notes: str | None = None
    source: str = "phone"
    hold_hours: int = Field(default=48, ge=0, le=24 * 30)
    notify_customer: bool = True


@router.post("/bookings", response_model=AdminBooking, status_code=201)
async def create_manual_booking(data: AdminBookingCreate, db: DB, user: StaffUser, request: Request):
    tour = await db.scalar(
        select(Tour)
        .where(Tour.slug == data.tour_slug)
        .options(selectinload(Tour.prices), selectinload(Tour.add_ons))
    )
    if not tour:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tour not found")
    departure = await db.get(Departure, data.departure_id) if data.departure_id else None
    try:
        quote = await build_quote(
            db,
            tour,
            rate_category=data.rate_category,
            currency=data.currency,
            adults=data.adults,
            children=data.children,
            departure=departure,
            travel_date=data.travel_date,
            add_on_ids=data.add_on_ids,
            promo_code=data.promo_code,
            payment_plan=data.payment_plan,
        )
        travellers = [t.model_dump() for t in data.travellers] or [
            {"full_name": data.contact_name, "traveller_type": "adult"}
        ]
        booking = await create_booking(
            db,
            tour=tour,
            quote=quote,
            contact={
                "name": data.contact_name,
                "email": data.contact_email,
                "phone": data.contact_phone,
                "country": data.contact_country,
            },
            travellers=travellers,
            special_requests=data.special_requests,
            user=None,
            source=data.source,
        )
    except QuoteError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    booking.internal_notes = data.internal_notes
    booking.hold_expires_at = (
        datetime.now(UTC) + timedelta(hours=data.hold_hours) if data.hold_hours else None
    )
    log_action(
        db,
        user,
        "booking.create",
        "booking",
        booking.reference,
        f"Manual booking via {data.source}",
        ip=client_ip(request),
    )
    await db.commit()
    if data.notify_customer:
        notifications.booking_created(
            await get_booking(db, booking.reference), await site_settings.get_all(db)
        )
    return await _admin_booking(db, booking.reference)


class BookingUpdate(BaseModel):
    contact_name: str | None = None
    contact_email: EmailStr | None = None
    contact_phone: str | None = None
    contact_country: str | None = None
    special_requests: str | None = None
    internal_notes: str | None = None
    balance_due_date: date | None = None
    travellers: list[TravellerIn] | None = None
    status: Literal["completed", "refunded"] | None = None


@router.patch("/bookings/{reference}", response_model=AdminBooking)
async def update_booking(reference: str, data: BookingUpdate, db: DB, user: StaffUser, request: Request):
    booking = await get_booking(db, reference)
    if not booking:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    changes = data.model_dump(exclude_unset=True, exclude={"travellers"})
    for k, v in changes.items():
        setattr(booking, k, v)
    if data.travellers is not None:
        booking.travellers = [
            Traveller(**t.model_dump(), is_lead=i == 0) for i, t in enumerate(data.travellers)
        ]
    log_action(
        db,
        user,
        "booking.update",
        "booking",
        reference,
        None,
        {k: str(v) for k, v in changes.items()},
        ip=client_ip(request),
    )
    await db.commit()
    return await _admin_booking(db, reference)


class CancelIn(BaseModel):
    reason: str = Field(min_length=2, max_length=300)


@router.post("/bookings/{reference}/cancel", response_model=AdminBooking)
async def cancel(reference: str, data: CancelIn, db: DB, user: StaffUser, request: Request):
    booking = await get_booking(db, reference)
    if not booking:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    if booking.status in (BookingStatus.cancelled, BookingStatus.refunded):
        raise HTTPException(status.HTTP_409_CONFLICT, "Booking is already cancelled.")
    await cancel_booking(db, booking, data.reason)
    log_action(db, user, "booking.cancel", "booking", reference, data.reason, ip=client_ip(request))
    await db.commit()
    return await _admin_booking(db, reference)


class ManualPaymentIn(BaseModel):
    method: PaymentMethod
    amount: Decimal = Field(gt=0)
    currency: Currency
    receipt_number: str | None = Field(default=None, max_length=80)
    paid_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=300)


@router.post("/bookings/{reference}/payments", response_model=AdminBooking, status_code=201)
async def add_manual_payment(
    reference: str, data: ManualPaymentIn, db: DB, user: StaffUser, request: Request
):
    booking = await get_booking(db, reference)
    if not booking:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    try:
        payment = await record_payment(
            db,
            booking,
            method=data.method,
            amount=data.amount,
            currency=data.currency,
            receipt_number=data.receipt_number.strip().upper() if data.receipt_number else None,
            notes=data.notes,
            recorded_by=user,
            paid_at=data.paid_at,
        )
    except PaymentError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    log_action(
        db,
        user,
        "payment.record",
        "payment",
        payment.reference,
        f"{data.currency} {data.amount} via {data.method} for {reference}",
        ip=client_ip(request),
    )
    await db.commit()
    return await _admin_booking(db, reference)


@router.post("/bookings/{reference}/resend", response_model=Message)
async def resend(reference: str, db: DB, user: StaffUser):
    booking = await get_booking(db, reference)
    if not booking:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    site = await site_settings.get_all(db)
    last_paid = next((p for p in reversed(booking.payments) if p.status == PaymentStatus.success), None)
    if booking.status == BookingStatus.pending_payment or last_paid is None:
        notifications.booking_created(booking, site)
    else:
        notifications.payment_received(booking, last_paid, None, site)
    log_action(db, user, "booking.resend_email", "booking", reference)
    await db.commit()
    return Message(message=f"Email sent to {booking.contact_email}")


@router.get("/bookings/{reference}/share-link")
async def share_link(reference: str, db: DB, _: StaffUser):
    booking = await get_booking(db, reference)
    if not booking:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    url = notifications.manage_url(booking)
    site = await site_settings.get_all(db)
    text = (
        f"Hi {booking.contact_name.split(' ')[0]}, here is your Safiri Nasi booking {booking.reference} for "
        f"{booking.tour.title}. View and pay securely here: {url}"
    )
    phone = "".join(ch for ch in booking.contact_phone if ch.isdigit())
    return {
        "url": url,
        "token": create_booking_token(reference),
        "whatsapp_text": text,
        "phone": phone,
        "company_whatsapp": site.get("whatsapp"),
    }


# --- Payments ledger --------------------------------------------------------------


class PaymentRow(AdminPayment):
    booking_reference: str = ""
    contact_name: str = ""


@router.get("/payments", response_model=Page[PaymentRow])
async def list_payments(
    db: DB,
    _: StaffUser,
    q: str | None = None,
    status_: str | None = Query(None, alias="status"),
    method: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    stmt = select(Payment).join(Booking, Payment.booking_id == Booking.id)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Payment.reference.ilike(like),
                Payment.receipt_number.ilike(like),
                Payment.phone.ilike(like),
                Booking.reference.ilike(like),
                Booking.contact_name.ilike(like),
            )
        )
    if status_:
        stmt = stmt.where(Payment.status.in_(status_.split(",")))
    if method:
        stmt = stmt.where(Payment.method.in_(method.split(",")))
    if date_from:
        stmt = stmt.where(Payment.created_at >= datetime.combine(date_from, datetime.min.time(), UTC))
    if date_to:
        stmt = stmt.where(
            Payment.created_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time(), UTC)
        )
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (
        await db.scalars(
            stmt.options(selectinload(Payment.booking), selectinload(Payment.recorded_by))
            .order_by(Payment.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    items = []
    for p in rows:
        row = PaymentRow.model_validate(p)
        row.booking_reference = p.booking.reference
        row.contact_name = p.booking.contact_name
        row.recorded_by_name = p.recorded_by.full_name if p.recorded_by else None
        items.append(row)
    return Page(items=items, total=total or 0, page=page, page_size=page_size)


@router.get("/payments/export.csv")
async def export_payments(db: DB, _: StaffUser, date_from: date | None = None, date_to: date | None = None):
    stmt = (
        select(Payment)
        .where(Payment.status.in_([PaymentStatus.success, PaymentStatus.refunded]))
        .options(selectinload(Payment.booking).selectinload(Booking.tour))
        .order_by(Payment.paid_at)
    )
    if date_from:
        stmt = stmt.where(Payment.paid_at >= datetime.combine(date_from, datetime.min.time(), UTC))
    if date_to:
        stmt = stmt.where(
            Payment.paid_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time(), UTC)
        )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "Paid at",
            "Payment ref",
            "Booking ref",
            "Customer",
            "Tour",
            "Method",
            "Provider",
            "Receipt",
            "Amount",
            "Currency",
            "Credited to booking",
            "Booking currency",
            "Status",
        ]
    )
    for p in (await db.scalars(stmt)).all():
        writer.writerow(
            [
                p.paid_at.isoformat() if p.paid_at else "",
                p.reference,
                p.booking.reference,
                p.booking.contact_name,
                p.booking.tour.title,
                p.method,
                p.provider,
                p.receipt_number or "",
                p.amount,
                p.currency,
                p.booking_amount,
                p.booking.currency,
                p.status,
            ]
        )
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="safiri-nasi-payments.csv"'},
    )


@router.post("/payments/{reference}/requery", response_model=AdminPayment)
async def requery(reference: str, db: DB, _: StaffUser):
    payment = await db.scalar(select(Payment).where(Payment.reference == reference))
    if not payment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    return await refresh_payment(db, payment, force=True)


class RefundIn(BaseModel):
    notes: str = Field(min_length=2, max_length=300)


@router.post("/payments/{reference}/refund", response_model=AdminPayment)
async def mark_refunded(reference: str, data: RefundIn, db: DB, user: StaffUser, request: Request):
    """Record that money was returned to the customer (refunds are sent from the provider's portal)."""
    payment = await db.scalar(select(Payment).where(Payment.reference == reference))
    if not payment or payment.status != PaymentStatus.success:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only successful payments can be marked refunded.")
    payment.status = PaymentStatus.refunded
    payment.notes = f"Refunded: {data.notes}"
    booking = await db.get(Booking, payment.booking_id)
    await recalculate_payments(db, booking)
    if booking.amount_paid == 0 and booking.status == BookingStatus.cancelled:
        booking.status = BookingStatus.refunded
    log_action(db, user, "payment.refund", "payment", reference, data.notes, ip=client_ip(request))
    await db.commit()
    await db.refresh(payment)
    return payment


class UnmatchedOut(ORM):
    id: int
    provider: str
    receipt_number: str
    amount: Money
    currency: str
    phone: str | None
    payer_name: str | None
    account_reference: str | None
    resolved: bool
    created_at: datetime


@router.get("/unmatched-payments", response_model=list[UnmatchedOut])
async def unmatched(db: DB, _: StaffUser, include_resolved: bool = False):
    stmt = select(UnmatchedPayment).order_by(UnmatchedPayment.created_at.desc())
    if not include_resolved:
        stmt = stmt.where(UnmatchedPayment.resolved.is_(False))
    return (await db.scalars(stmt)).all()


class AssignIn(BaseModel):
    booking_reference: str


@router.post("/unmatched-payments/{item_id}/assign", response_model=Message)
async def assign_unmatched(item_id: int, data: AssignIn, db: DB, user: StaffUser, request: Request):
    item = await db.get(UnmatchedPayment, item_id)
    if not item or item.resolved:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unmatched payment not found")
    booking = await get_booking(db, data.booking_reference)
    if not booking:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    item.resolved = True
    item.resolved_booking_id = booking.id
    item.resolved_by_id = user.id
    item.resolved_at = datetime.now(UTC)
    receipt = item.receipt_number
    item.receipt_number = f"{receipt}-ASSIGNED"  # free the receipt number for the real payment row
    await db.flush()
    try:
        await record_payment(
            db,
            booking,
            method=PaymentMethod.paybill,
            provider="daraja_c2b",
            amount=item.amount,
            currency=item.currency,
            receipt_number=receipt,
            phone=item.phone,
            notes=f"Matched manually from Paybill (account '{item.account_reference}')",
            raw=item.raw,
            recorded_by=user,
            paid_at=item.created_at,
        )
    except PaymentError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    log_action(
        db,
        user,
        "payment.assign_unmatched",
        "booking",
        booking.reference,
        f"Receipt {receipt}",
        ip=client_ip(request),
    )
    await db.commit()
    return Message(message=f"Payment {receipt} applied to {booking.reference}")
