import secrets
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models import Booking, Departure, Payment, PromoCode, Tour, Traveller, User
from app.models.enums import BookingStatus, DepartureStatus, PaymentStatus
from app.services.pricing import Quote, QuoteError, find_promo

REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I to avoid misreads over the phone
CLOSED_STATUSES = (BookingStatus.cancelled, BookingStatus.expired, BookingStatus.refunded)


def jsonable(value: Any) -> Any:
    """Make quote structures safe for JSON columns (Decimals become floats)."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [jsonable(v) for v in value]
    return value


def new_reference(prefix: str = "SN") -> str:
    return f"{prefix}-" + "".join(secrets.choice(REFERENCE_ALPHABET) for _ in range(6))


async def unique_booking_reference(db: AsyncSession) -> str:
    while True:
        ref = new_reference()
        if not await db.scalar(select(Booking.id).where(Booking.reference == ref)):
            return ref


def booking_load_options():
    return (
        selectinload(Booking.tour).selectinload(Tour.destination),
        selectinload(Booking.tour).selectinload(Tour.itinerary),
        selectinload(Booking.departure),
        selectinload(Booking.travellers),
        selectinload(Booking.payments),
    )


async def get_booking(db: AsyncSession, reference: str) -> Booking | None:
    return await db.scalar(
        select(Booking)
        .where(Booking.reference == reference.strip().upper())
        .options(*booking_load_options())
        .execution_options(populate_existing=True)
    )


async def _lock_departure(db: AsyncSession, departure_id: int) -> Departure:
    return await db.scalar(select(Departure).where(Departure.id == departure_id).with_for_update())


def _sync_departure_status(departure: Departure) -> None:
    if departure.seats_left <= 0 and departure.status in (DepartureStatus.open, DepartureStatus.guaranteed):
        departure.status = DepartureStatus.sold_out
    elif departure.seats_left > 0 and departure.status == DepartureStatus.sold_out:
        departure.status = DepartureStatus.open


async def create_booking(
    db: AsyncSession,
    *,
    tour: Tour,
    quote: Quote,
    contact: dict,
    travellers: list[dict],
    special_requests: str | None,
    user: User | None,
    source: str = "web",
) -> Booking:
    pax = quote.adults + quote.children
    if quote.departure_id:
        departure = await _lock_departure(db, quote.departure_id)
        if departure is None or departure.seats_left < pax:
            raise QuoteError("Sorry, those seats were just taken. Please pick another date.")
        departure.seats_booked += pax
        _sync_departure_status(departure)

    if quote.promo_code:
        promo: PromoCode | None = await find_promo(db, quote.promo_code)
        if promo:
            promo.used_count += 1

    booking = Booking(
        reference=await unique_booking_reference(db),
        user_id=user.id if user else None,
        tour_id=tour.id,
        departure_id=quote.departure_id,
        travel_date=quote.travel_date,
        end_date=quote.end_date,
        adults=quote.adults,
        children=quote.children,
        rate_category=quote.rate_category,
        currency=quote.currency,
        contact_name=contact["name"],
        contact_email=contact["email"].lower(),
        contact_phone=contact["phone"],
        contact_country=contact.get("country"),
        special_requests=special_requests,
        line_items=jsonable(quote.line_items),
        add_ons=jsonable(quote.add_ons),
        subtotal=quote.subtotal,
        discount=quote.discount,
        total=quote.total,
        deposit_amount=quote.deposit_amount,
        amount_paid=Decimal(0),
        balance=quote.total,
        payment_plan=quote.payment_plan,
        balance_due_date=quote.balance_due_date,
        promo_code=quote.promo_code,
        status=BookingStatus.pending_payment,
        seats_held=pax if quote.departure_id else 0,
        hold_expires_at=datetime.now(UTC) + timedelta(minutes=settings.hold_minutes),
        source=source,
    )
    for i, t in enumerate(travellers):
        booking.travellers.append(
            Traveller(
                full_name=t["full_name"],
                traveller_type=t.get("traveller_type", "adult"),
                nationality=t.get("nationality"),
                passport_number=t.get("passport_number"),
                date_of_birth=t.get("date_of_birth"),
                dietary=t.get("dietary"),
                is_lead=i == 0,
            )
        )
    tour.popularity += 1
    db.add(booking)
    await db.flush()
    return booking


async def release_seats(db: AsyncSession, booking: Booking) -> None:
    if booking.departure_id and booking.seats_held:
        departure = await _lock_departure(db, booking.departure_id)
        if departure:
            departure.seats_booked = max(departure.seats_booked - booking.seats_held, 0)
            _sync_departure_status(departure)
    booking.seats_held = 0


async def _reclaim_seats(db: AsyncSession, booking: Booking) -> None:
    """A payment landed on an expired booking: take the seats back, even if it overbooks."""
    if booking.departure_id and booking.seats_held == 0:
        departure = await _lock_departure(db, booking.departure_id)
        if departure:
            if departure.seats_left < booking.pax:
                note = f"[{datetime.now(UTC):%Y-%m-%d}] Paid after hold expired; departure now overbooked."
                booking.internal_notes = "\n".join(filter(None, [booking.internal_notes, note]))
            departure.seats_booked += booking.pax
            _sync_departure_status(departure)
        booking.seats_held = booking.pax


async def recalculate_payments(db: AsyncSession, booking: Booking) -> str | None:
    """Recompute paid/balance from successful payments and advance the status.

    Returns the milestone newly reached ("confirmed" / "fully_paid") so callers can notify.
    """
    payments = (await db.scalars(select(Payment).where(Payment.booking_id == booking.id))).all()
    paid = sum((p.booking_amount for p in payments if p.status == PaymentStatus.success), Decimal(0))
    booking.amount_paid = paid
    booking.balance = max(booking.total - paid, Decimal(0))

    if booking.status in (BookingStatus.cancelled, BookingStatus.refunded, BookingStatus.completed):
        return None

    previous = booking.status
    if paid >= booking.total and booking.total > 0:
        new_status = BookingStatus.fully_paid
    elif paid >= booking.deposit_amount and paid > 0:
        new_status = BookingStatus.confirmed
    else:
        return None

    if previous == BookingStatus.expired:
        await _reclaim_seats(db, booking)
    if new_status != previous:
        booking.status = new_status
        booking.hold_expires_at = None
        if booking.confirmed_at is None:
            booking.confirmed_at = datetime.now(UTC)
        return new_status
    return None


async def cancel_booking(db: AsyncSession, booking: Booking, reason: str | None) -> None:
    await release_seats(db, booking)
    booking.status = BookingStatus.cancelled
    booking.cancelled_at = datetime.now(UTC)
    booking.cancellation_reason = reason
    booking.hold_expires_at = None


async def expire_booking(db: AsyncSession, booking: Booking) -> None:
    await release_seats(db, booking)
    booking.status = BookingStatus.expired
    booking.hold_expires_at = None


async def extend_hold(booking: Booking, minutes: int = 15) -> None:
    """Keep seats while a customer is mid-payment so the hold can't lapse under them."""
    if booking.status == BookingStatus.pending_payment:
        floor = datetime.now(UTC) + timedelta(minutes=minutes)
        if booking.hold_expires_at is None or booking.hold_expires_at < floor:
            booking.hold_expires_at = floor
