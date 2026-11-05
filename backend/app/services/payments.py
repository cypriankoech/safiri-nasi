import logging
import re
import secrets
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Booking, Payment, ProviderCallback, UnmatchedPayment, User
from app.models.enums import BookingStatus, Currency, PaymentMethod, PaymentStatus
from app.payments import airtel as airtel_mod
from app.payments import mpesa as mpesa_mod
from app.payments.airtel import AirtelProvider
from app.payments.base import PaymentProvider, ProviderError, StatusResult
from app.payments.dpo import DpoProvider
from app.payments.mock import MockCard, MockMobileMoney
from app.payments.mpesa import MpesaProvider
from app.payments.phone import InvalidPhone, detect_network, normalize_ke_phone
from app.services import notifications, site_settings
from app.services.booking import (
    CLOSED_STATUSES,
    REFERENCE_ALPHABET,
    _lock_departure,
    _sync_departure_status,
    extend_hold,
    get_booking,
    recalculate_payments,
)
from app.services.pricing import convert, money, to_kes_for_mobile_money

log = logging.getLogger(__name__)

ONLINE_METHODS = (PaymentMethod.mpesa, PaymentMethod.airtel, PaymentMethod.card)
FINAL_STATUSES = (PaymentStatus.success, PaymentStatus.refunded, PaymentStatus.cancelled)
MOBILE_TIMEOUT = timedelta(minutes=3)


class PaymentError(ValueError):
    pass


def provider_for(method: str) -> PaymentProvider:
    if settings.payments_mode == "mock":
        return MockCard() if method == PaymentMethod.card else MockMobileMoney(method)
    if method == PaymentMethod.mpesa:
        return MpesaProvider()
    if method == PaymentMethod.airtel:
        return AirtelProvider()
    if method == PaymentMethod.card:
        return DpoProvider()
    raise PaymentError(f"Unsupported payment method {method}")


def provider_name(method: str) -> str:
    if settings.payments_mode == "mock":
        return "mock"
    return {"mpesa": "daraja", "airtel": "airtel", "card": "dpo"}[method]


async def new_payment_reference(db: AsyncSession) -> str:
    while True:
        ref = "PY" + "".join(secrets.choice(REFERENCE_ALPHABET) for _ in range(10))
        if not await db.scalar(select(Payment.id).where(Payment.reference == ref)):
            return ref


async def _rehold_if_possible(db: AsyncSession, booking: Booking) -> None:
    """Let a customer whose hold lapsed still pay, as long as the seats are free."""
    if booking.departure_id:
        departure = await _lock_departure(db, booking.departure_id)
        if departure is None or departure.seats_left < booking.pax or not departure.is_bookable:
            raise PaymentError(
                "Your seat hold expired and the departure is now full. Please choose another date."
            )
        departure.seats_booked += booking.pax
        _sync_departure_status(departure)
        booking.seats_held = booking.pax
    booking.status = BookingStatus.pending_payment


async def start_payment(
    db: AsyncSession, booking: Booking, *, method: str, phone: str | None = None, pay_full: bool = False
) -> Payment:
    if method not in ONLINE_METHODS:
        raise PaymentError("Choose M-Pesa, Airtel Money or card.")
    enabled = (await site_settings.get_value(db, "payment_methods")) or {}
    if enabled.get(method) is False:
        raise PaymentError("That payment method is currently unavailable.")
    if booking.status in (BookingStatus.cancelled, BookingStatus.refunded, BookingStatus.completed):
        raise PaymentError("This booking can no longer take payments.")
    if booking.status == BookingStatus.expired:
        await _rehold_if_possible(db, booking)

    amount_due = booking.balance if pay_full else booking.amount_due_now
    if amount_due <= 0:
        raise PaymentError("Nothing is due on this booking right now.")

    fx = await site_settings.usd_to_kes(db)
    normalized_phone = None
    if method in (PaymentMethod.mpesa, PaymentMethod.airtel):
        try:
            normalized_phone = normalize_ke_phone(phone or "")
        except InvalidPhone as exc:
            raise PaymentError(str(exc)) from exc
        network = detect_network(normalized_phone)
        if method == PaymentMethod.mpesa and network == "airtel":
            raise PaymentError("That's an Airtel number. Choose Airtel Money instead.")
        if method == PaymentMethod.airtel and network == "safaricom":
            raise PaymentError("That's a Safaricom number. Choose M-Pesa instead.")
        charge_currency = Currency.KES
        charge_amount = to_kes_for_mobile_money(amount_due, booking.currency, fx)
        fx_rate = fx if booking.currency == Currency.USD else Decimal(1)
        # Guard against duplicate taps: reuse an in-flight prompt to the same phone.
        recent = await db.scalar(
            select(Payment).where(
                Payment.booking_id == booking.id,
                Payment.method == method,
                Payment.phone == normalized_phone,
                Payment.status == PaymentStatus.processing,
                Payment.created_at > datetime.now(UTC) - timedelta(seconds=45),
            )
        )
        if recent:
            return recent
    else:
        charge_currency = booking.currency
        charge_amount = money(amount_due, booking.currency)
        fx_rate = Decimal(1)

    payment = Payment(
        reference=await new_payment_reference(db),
        booking_id=booking.id,
        method=method,
        provider=provider_name(method),
        amount=charge_amount,
        currency=charge_currency,
        booking_amount=amount_due,
        fx_rate=fx_rate,
        status=PaymentStatus.pending,
        phone=normalized_phone,
        raw={},
    )
    db.add(payment)
    await db.flush()
    await db.refresh(payment)

    try:
        result = await provider_for(method).initiate(payment, booking)
    except ProviderError as exc:
        payment.status = PaymentStatus.failed
        payment.failure_reason = str(exc)
        await db.commit()
        raise PaymentError(str(exc)) from exc
    except Exception as exc:  # network errors etc.
        log.exception("Payment initiation failed for %s", payment.reference)
        payment.status = PaymentStatus.failed
        payment.failure_reason = "Payment provider unreachable"
        await db.commit()
        raise PaymentError("We couldn't reach the payment provider. Please try again.") from exc

    payment.status = PaymentStatus.processing
    payment.provider_reference = result.provider_reference
    payment.redirect_url = result.redirect_url
    payment.notes = result.message
    payment.raw = {**(payment.raw or {}), **result.raw}
    await extend_hold(booking)
    await db.commit()
    return payment


async def apply_result(db: AsyncSession, payment: Payment, result: StatusResult) -> str | None:
    """Move a payment to its final state exactly once and update the booking.

    A payment that previously failed (e.g. timed out) may still turn successful, because a
    late success means the customer's money really moved.
    """
    payment.last_checked_at = datetime.now(UTC)
    if payment.status in FINAL_STATUSES or result.outcome == "pending":
        return None

    payment.raw = {**(payment.raw or {}), "last_status": _safe_raw(result.raw)}
    if result.outcome == "failed":
        if payment.status != PaymentStatus.failed:
            payment.status = PaymentStatus.failed
            payment.failure_reason = result.failure_reason
        return None

    receipt = result.receipt_number or payment.receipt_number
    if receipt:
        clash = await db.scalar(
            select(Payment.id).where(Payment.receipt_number == receipt, Payment.id != payment.id)
        )
        if clash:
            log.warning("Receipt %s already recorded on payment %s", receipt, clash)
            return None
    payment.receipt_number = receipt
    payment.status = PaymentStatus.success
    payment.failure_reason = None
    payment.paid_at = datetime.now(UTC)
    booking = await get_booking(db, (await db.get(Booking, payment.booking_id)).reference)
    milestone = await recalculate_payments(db, booking)
    await db.commit()
    site = await site_settings.get_all(db)
    notifications.payment_received(booking, payment, milestone, site)
    return milestone


def _safe_raw(raw: dict) -> dict:
    return {k: v for k, v in (raw or {}).items() if not k.startswith("_")}


async def refresh_payment(db: AsyncSession, payment: Payment, *, force: bool = False) -> Payment:
    """Poll the provider for a processing payment (rate-limited unless forced)."""
    if payment.status != PaymentStatus.processing or payment.method not in ONLINE_METHODS:
        return payment
    now = datetime.now(UTC)
    if not force and payment.last_checked_at and now - payment.last_checked_at < timedelta(seconds=4):
        return payment
    try:
        result = await provider_for(payment.method).query_status(payment)
    except ProviderError as exc:
        log.warning("Status query failed for %s: %s", payment.reference, exc)
        result = StatusResult("pending")
    except Exception:
        log.exception("Status query crashed for %s", payment.reference)
        result = StatusResult("pending")

    if (
        result.outcome == "pending"
        and payment.method != PaymentMethod.card
        and payment.created_at
        and now - payment.created_at > MOBILE_TIMEOUT
    ):
        result = StatusResult("failed", failure_reason="No response from your phone. Please try again.")
    await apply_result(db, payment, result)
    payment.last_checked_at = now
    await db.commit()
    return payment


def log_callback(
    db: AsyncSession, provider: str, kind: str, payload: dict, ip: str | None
) -> ProviderCallback:
    entry = ProviderCallback(provider=provider, kind=kind, payload=payload, remote_ip=ip)
    db.add(entry)
    return entry


async def handle_mpesa_stk_callback(db: AsyncSession, body: dict, ip: str | None) -> None:
    entry = log_callback(db, "daraja", "stk_callback", body, ip)
    data = mpesa_mod.parse_stk_callback(body)
    payment = await db.scalar(
        select(Payment).where(
            Payment.provider_reference == data["checkout_request_id"], Payment.method == PaymentMethod.mpesa
        )
    )
    if payment is None:
        entry.error = "Unknown CheckoutRequestID"
        await db.commit()
        return
    entry.payment_id = payment.id
    payment.raw = {**(payment.raw or {}), "callback": data}
    if data["result_code"] == "0":
        # Confirm with Safaricom before crediting: callbacks are unsigned.
        confirmed = await provider_for(PaymentMethod.mpesa).query_status(payment)
        if confirmed.outcome != "success":
            entry.error = f"STK query did not confirm success ({confirmed.outcome})"
            await db.commit()
            return
        result = StatusResult("success", receipt_number=data["receipt"], raw=data)
    else:
        message = mpesa_mod.RESULT_MESSAGES.get(
            data["result_code"], data["result_desc"] or "M-Pesa payment failed."
        )
        result = StatusResult("failed", failure_reason=message, raw=data)
    entry.processed = True
    await db.commit()
    await apply_result(db, payment, result)
    await db.commit()


async def handle_airtel_callback(db: AsyncSession, body: dict, ip: str | None) -> None:
    entry = log_callback(db, "airtel", "collection_callback", body, ip)
    if not airtel_mod.callback_signature_valid(body):
        entry.error = "Invalid callback hash"
        await db.commit()
        return
    txn = body.get("transaction") or {}
    payment = await db.scalar(
        select(Payment).where(Payment.reference == txn.get("id"), Payment.method == PaymentMethod.airtel)
    )
    if payment is None:
        entry.error = "Unknown transaction id"
        await db.commit()
        return
    entry.payment_id = payment.id
    entry.processed = True
    await db.commit()
    result = await provider_for(PaymentMethod.airtel).query_status(payment)
    if result.outcome == "success" and not result.receipt_number:
        result.receipt_number = txn.get("airtel_money_id")
    await apply_result(db, payment, result)
    await db.commit()


def normalize_booking_reference(raw: str | None) -> str | None:
    if not raw:
        return None
    cleaned = re.sub(r"[^A-Z0-9]", "", raw.upper())
    if cleaned.startswith("SN") and len(cleaned) == 8:
        return f"SN-{cleaned[2:]}"
    return None


async def handle_c2b_confirmation(db: AsyncSession, body: dict, ip: str | None) -> None:
    """Money paid straight to the Paybill/Till (not via STK). Match it to a booking by account number."""
    entry = log_callback(db, "daraja", "c2b_confirmation", body, ip)
    receipt = body.get("TransID")
    amount = Decimal(str(body.get("TransAmount") or "0"))
    if not receipt or amount <= 0:
        entry.error = "Missing TransID/amount"
        await db.commit()
        return
    if await db.scalar(select(Payment.id).where(Payment.receipt_number == receipt)) or await db.scalar(
        select(UnmatchedPayment.id).where(UnmatchedPayment.receipt_number == receipt)
    ):
        entry.processed = True
        await db.commit()
        return

    payer = (
        " ".join(filter(None, [body.get("FirstName"), body.get("MiddleName"), body.get("LastName")])) or None
    )
    reference = normalize_booking_reference(body.get("BillRefNumber"))
    booking = await get_booking(db, reference) if reference else None
    if booking is None or (booking.status in CLOSED_STATUSES and booking.status != BookingStatus.expired):
        db.add(
            UnmatchedPayment(
                provider="daraja",
                receipt_number=receipt,
                amount=amount,
                phone=str(body.get("MSISDN") or ""),
                payer_name=payer,
                account_reference=body.get("BillRefNumber"),
                raw=body,
            )
        )
        entry.processed = True
        await db.commit()
        return

    await record_payment(
        db,
        booking,
        method=PaymentMethod.paybill,
        provider="daraja_c2b",
        amount=amount,
        currency=Currency.KES,
        receipt_number=receipt,
        phone=str(body.get("MSISDN") or "") or None,
        notes=f"Paybill payment from {payer or 'customer'}",
        raw=body,
    )
    entry.processed = True
    await db.commit()


async def record_payment(
    db: AsyncSession,
    booking: Booking,
    *,
    method: str,
    amount: Decimal,
    currency: str,
    receipt_number: str | None = None,
    provider: str = "manual",
    phone: str | None = None,
    notes: str | None = None,
    raw: dict | None = None,
    recorded_by: User | None = None,
    paid_at: datetime | None = None,
) -> Payment:
    """Record money that already arrived (Paybill, bank transfer, cash, or C2B)."""
    if receipt_number and await db.scalar(select(Payment.id).where(Payment.receipt_number == receipt_number)):
        raise PaymentError(f"Receipt {receipt_number} is already recorded.")
    fx = await site_settings.usd_to_kes(db)
    booking_amount = money(convert(amount, currency, booking.currency, fx), booking.currency)
    payment = Payment(
        reference=await new_payment_reference(db),
        booking_id=booking.id,
        method=method,
        provider=provider,
        amount=amount,
        currency=currency,
        booking_amount=booking_amount,
        fx_rate=fx if currency != booking.currency else Decimal(1),
        status=PaymentStatus.success,
        phone=phone,
        receipt_number=receipt_number,
        notes=notes,
        raw=raw or {},
        recorded_by_id=recorded_by.id if recorded_by else None,
        paid_at=paid_at or datetime.now(UTC),
    )
    db.add(payment)
    await db.flush()
    milestone = await recalculate_payments(db, booking)
    await db.commit()
    site = await site_settings.get_all(db)
    notifications.payment_received(booking, payment, milestone, site)
    return payment
