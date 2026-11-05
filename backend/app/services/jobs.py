"""Background jobs run in-process by APScheduler (see main.lifespan)."""

import logging
from datetime import UTC, date, datetime, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select

from app.db import SessionLocal
from app.models import Booking, Payment
from app.models.enums import BookingStatus, PaymentStatus
from app.services import notifications, site_settings
from app.services.booking import booking_load_options, expire_booking
from app.services.payments import ONLINE_METHODS, refresh_payment

log = logging.getLogger(__name__)

REMINDER_DAYS = (14, 7, 2)


async def expire_unpaid_holds() -> None:
    async with SessionLocal() as db:
        now = datetime.now(UTC)
        bookings = (
            await db.scalars(
                select(Booking).where(
                    Booking.status == BookingStatus.pending_payment,
                    Booking.hold_expires_at < now,
                    Booking.amount_paid == 0,
                )
            )
        ).all()
        for booking in bookings:
            in_flight = await db.scalar(
                select(Payment.id).where(
                    Payment.booking_id == booking.id, Payment.status == PaymentStatus.processing
                )
            )
            if in_flight:
                continue
            await expire_booking(db, booking)
            log.info("Expired unpaid hold %s", booking.reference)
        await db.commit()


async def poll_pending_payments() -> None:
    """Safety net for lost callbacks: ask providers about payments still in flight."""
    async with SessionLocal() as db:
        cutoff = datetime.now(UTC) - timedelta(hours=3)
        payments = (
            await db.scalars(
                select(Payment).where(
                    Payment.status == PaymentStatus.processing,
                    Payment.method.in_(ONLINE_METHODS),
                    Payment.created_at > cutoff,
                )
            )
        ).all()
        for payment in payments:
            try:
                await refresh_payment(db, payment)
            except Exception:
                log.exception("Polling payment %s failed", payment.reference)
                await db.rollback()


async def send_balance_reminders() -> None:
    async with SessionLocal() as db:
        site = await site_settings.get_all(db)
        today = date.today()
        bookings = (
            await db.scalars(
                select(Booking)
                .where(Booking.status == BookingStatus.confirmed, Booking.balance > 0)
                .options(*booking_load_options())
            )
        ).all()
        for booking in bookings:
            if not booking.balance_due_date:
                continue
            days = (booking.balance_due_date - today).days
            key = f"balance_{days}"
            if days in REMINDER_DAYS and key not in (booking.reminders_sent or []):
                notifications.balance_reminder(booking, days, site)
                booking.reminders_sent = [*(booking.reminders_sent or []), key]
        await db.commit()


async def complete_finished_trips() -> None:
    async with SessionLocal() as db:
        site = await site_settings.get_all(db)
        bookings = (
            await db.scalars(
                select(Booking)
                .where(
                    Booking.status.in_([BookingStatus.fully_paid, BookingStatus.confirmed]),
                    Booking.end_date < date.today(),
                )
                .options(*booking_load_options())
            )
        ).all()
        for booking in bookings:
            booking.status = BookingStatus.completed
            if "review_request" not in (booking.reminders_sent or []):
                notifications.review_request(booking, site)
                booking.reminders_sent = [*(booking.reminders_sent or []), "review_request"]
        await db.commit()


def build_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="Africa/Nairobi")
    scheduler.add_job(expire_unpaid_holds, "interval", minutes=1, id="expire_holds", max_instances=1)
    scheduler.add_job(poll_pending_payments, "interval", seconds=20, id="poll_payments", max_instances=1)
    scheduler.add_job(send_balance_reminders, "cron", hour=9, minute=0, id="balance_reminders")
    scheduler.add_job(complete_finished_trips, "cron", hour=6, minute=0, id="complete_trips")
    return scheduler
