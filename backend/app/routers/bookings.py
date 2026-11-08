from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.deps import DB, CurrentUser, OptionalUser, can_access_booking
from app.models import Booking, Departure, Payment, Tour
from app.models.enums import BookingStatus, PaymentStatus, PublishStatus
from app.payments.phone import InvalidPhone, normalize_ke_phone
from app.schemas.booking import (
    BookingCreate,
    BookingCreated,
    BookingLookup,
    BookingOut,
    PaymentOut,
    StartPayment,
)
from app.security import create_booking_token
from app.services import documents, notifications, site_settings
from app.services.booking import booking_load_options, create_booking, get_booking
from app.services.payments import PaymentError, refresh_payment, start_payment
from app.services.pricing import QuoteError, build_quote

router = APIRouter(prefix="/api", tags=["bookings"])

BookingToken = Annotated[str | None, Header(alias="X-Booking-Token")]


async def _authorized_booking(
    db: DB, reference: str, user, header_token: str | None, query_token: str | None = None
) -> Booking:
    booking = await get_booking(db, reference)
    if not booking or not can_access_booking(booking, user, header_token or query_token):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    return booking


@router.post("/bookings", response_model=BookingCreated, status_code=201)
async def create(data: BookingCreate, db: DB, user: OptionalUser):
    tour = await db.scalar(
        select(Tour)
        .where(Tour.slug == data.tour_slug, Tour.status == PublishStatus.published)
        .options(selectinload(Tour.prices), selectinload(Tour.add_ons))
    )
    if not tour:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tour not found")
    try:
        normalize_ke_phone(data.contact.phone)
    except InvalidPhone:
        # International guests may give a foreign number; only require a plausible one.
        digits = "".join(ch for ch in data.contact.phone if ch.isdigit())
        if len(digits) < 7:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "Please enter a valid phone number."
            ) from None

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
        travellers = [t.model_dump() for t in data.travellers]
        if not travellers:
            travellers = [{"full_name": data.contact.name, "traveller_type": "adult"}]
        booking = await create_booking(
            db,
            tour=tour,
            quote=quote,
            contact=data.contact.model_dump(),
            travellers=travellers,
            special_requests=data.special_requests,
            user=user,
        )
    except QuoteError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    await db.commit()
    booking = await get_booking(db, booking.reference)
    notifications.booking_created(booking, await site_settings.get_all(db))
    return BookingCreated(
        booking=BookingOut.model_validate(booking), access_token=create_booking_token(booking.reference)
    )


@router.post("/bookings/lookup", response_model=BookingCreated)
async def lookup(data: BookingLookup, db: DB):
    booking = await get_booking(db, data.reference)
    if not booking or booking.contact_email.lower() != data.email.lower():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No booking matches that reference and email.")
    return BookingCreated(
        booking=BookingOut.model_validate(booking), access_token=create_booking_token(booking.reference)
    )


@router.get("/bookings/{reference}", response_model=BookingOut)
async def get(
    reference: str, db: DB, user: OptionalUser, x_booking_token: BookingToken = None, t: str | None = None
):
    return await _authorized_booking(db, reference, user, x_booking_token, t)


@router.get("/me/bookings", response_model=list[BookingOut])
async def my_bookings(db: DB, user: CurrentUser):
    rows = await db.scalars(
        select(Booking)
        .where(or_(Booking.user_id == user.id, func.lower(Booking.contact_email) == user.email.lower()))
        .options(*booking_load_options())
        .order_by(Booking.travel_date.desc())
    )
    return rows.all()


@router.post("/bookings/{reference}/payments", response_model=PaymentOut, status_code=201)
async def pay(
    reference: str, data: StartPayment, db: DB, user: OptionalUser, x_booking_token: BookingToken = None
):
    booking = await _authorized_booking(db, reference, user, x_booking_token)
    try:
        return await start_payment(db, booking, method=data.method, phone=data.phone, pay_full=data.pay_full)
    except PaymentError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc


async def _authorized_payment(db: DB, reference: str, user, token: str | None) -> tuple[Payment, Booking]:
    payment = await db.scalar(select(Payment).where(Payment.reference == reference))
    if not payment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    booking = await db.get(Booking, payment.booking_id)
    if not can_access_booking(booking, user, token):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    return payment, booking


@router.get("/payments/{reference}")
async def payment_status(
    reference: str, db: DB, user: OptionalUser, x_booking_token: BookingToken = None, t: str | None = None
):
    """Polled by the checkout while a mobile-money prompt or card redirect is in flight."""
    payment, booking = await _authorized_payment(db, reference, user, x_booking_token or t)
    if payment.status == PaymentStatus.processing:
        payment = await refresh_payment(db, payment)
        await db.refresh(booking)
    return {
        "payment": PaymentOut.model_validate(payment),
        "booking_reference": booking.reference,
        "booking_status": booking.status,
        "amount_paid": float(booking.amount_paid),
        "balance": float(booking.balance),
        "currency": booking.currency,
    }


@router.post("/payments/{reference}/verify")
async def verify_payment(
    reference: str, db: DB, user: OptionalUser, x_booking_token: BookingToken = None, t: str | None = None
):
    payment, booking = await _authorized_payment(db, reference, user, x_booking_token or t)
    payment = await refresh_payment(db, payment, force=True)
    await db.refresh(booking)
    return {
        "payment": PaymentOut.model_validate(payment),
        "booking_reference": booking.reference,
        "booking_status": booking.status,
        "access_token": create_booking_token(booking.reference),
    }


def _pdf(content: bytes, filename: str) -> Response:
    return Response(
        content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/bookings/{reference}/invoice.pdf")
async def invoice(
    reference: str,
    db: DB,
    user: OptionalUser,
    x_booking_token: BookingToken = None,
    t: str | None = Query(None),
):
    booking = await _authorized_booking(db, reference, user, x_booking_token, t)
    pdf = await documents.invoice_pdf(booking, await site_settings.get_all(db))
    return _pdf(pdf, f"Safiri-Nasi-Invoice-{booking.reference}.pdf")


@router.get("/bookings/{reference}/voucher.pdf")
async def voucher(
    reference: str,
    db: DB,
    user: OptionalUser,
    x_booking_token: BookingToken = None,
    t: str | None = Query(None),
):
    booking = await _authorized_booking(db, reference, user, x_booking_token, t)
    if booking.status not in (BookingStatus.confirmed, BookingStatus.fully_paid, BookingStatus.completed):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Your voucher is available once the booking is confirmed."
        )
    pdf = await documents.voucher_pdf(booking, await site_settings.get_all(db))
    return _pdf(pdf, f"Safiri-Nasi-Voucher-{booking.reference}.pdf")


@router.get("/payments/{reference}/receipt.pdf")
async def receipt(
    reference: str,
    db: DB,
    user: OptionalUser,
    x_booking_token: BookingToken = None,
    t: str | None = Query(None),
):
    payment, booking = await _authorized_payment(db, reference, user, x_booking_token or t)
    if payment.status != PaymentStatus.success:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Receipts are issued for successful payments only.")
    booking = await get_booking(db, booking.reference)
    pdf = await documents.receipt_pdf(booking, payment, await site_settings.get_all(db))
    return _pdf(pdf, f"Safiri-Nasi-Receipt-{payment.reference}.pdf")
