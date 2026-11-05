"""Transactional email. Context is built from ORM objects up front, then sent in the
background so a slow SMTP server never blocks a request or a payment callback."""

import asyncio
import logging
from decimal import Decimal
from email.message import EmailMessage
from pathlib import Path
from typing import Any

import aiosmtplib
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.config import settings
from app.models import Booking, Enquiry, Payment
from app.security import create_booking_token

log = logging.getLogger(__name__)

TEMPLATES = Environment(
    loader=FileSystemLoader(Path(__file__).resolve().parent.parent / "templates" / "email"),
    autoescape=select_autoescape(["html"]),
)

METHOD_LABELS = {
    "mpesa": "M-Pesa",
    "airtel": "Airtel Money",
    "card": "card",
    "paybill": "M-Pesa Paybill",
    "bank": "bank transfer",
    "cash": "cash",
}

_background: set[asyncio.Task] = set()


def fmt_money(amount: Decimal | float | int, currency: str) -> str:
    value = Decimal(str(amount))
    if currency == "KES":
        return f"KES {value:,.0f}"
    return f"{currency} {value:,.2f}"


def fmt_date(d) -> str:
    return d.strftime("%a %d %b %Y") if d else ""


def manage_url(booking: Booking) -> str:
    return f"{settings.frontend_url}/booking/{booking.reference}?t={create_booking_token(booking.reference)}"


def booking_context(booking: Booking) -> dict[str, Any]:
    c = booking.currency
    return {
        "reference": booking.reference,
        "first_name": booking.contact_name.split(" ")[0],
        "tour_title": booking.tour.title,
        "travel_date": fmt_date(booking.travel_date),
        "end_date": fmt_date(booking.end_date),
        "adults": booking.adults,
        "children": booking.children,
        "total": fmt_money(booking.total, c),
        "deposit": fmt_money(booking.deposit_amount, c),
        "amount_paid": fmt_money(booking.amount_paid, c),
        "balance": fmt_money(booking.balance, c),
        "balance_due_date": fmt_date(booking.balance_due_date),
        "payment_plan": booking.payment_plan,
        "manage_url": manage_url(booking),
        "review_url": f"{settings.frontend_url}/tours/{booking.tour.slug}?review={booking.reference}"
        f"&t={create_booking_token(booking.reference)}#reviews",
    }


async def _send(to: str, subject: str, template: str, context: dict[str, Any]) -> None:
    if not settings.send_emails:
        return
    try:
        html = TEMPLATES.get_template(template).render(subject=subject, **context)
        msg = EmailMessage()
        msg["From"] = settings.mail_from
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content("This message is best viewed in an HTML-capable email client.")
        msg.add_alternative(html, subtype="html")
        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user,
            password=settings.smtp_password,
            use_tls=settings.smtp_tls,
            start_tls=settings.smtp_starttls,
            timeout=20,
        )
    except Exception:  # noqa: BLE001 - email must never break the caller
        log.exception("Failed to send email %r to %s", subject, to)


def send_later(to: str, subject: str, template: str, context: dict[str, Any]) -> None:
    task = asyncio.create_task(_send(to, subject, template, context))
    _background.add(task)
    task.add_done_callback(_background.discard)


def _admin_alert(site: dict, title: str, rows: list[tuple[str, str]], url: str | None = None) -> None:
    send_later(
        settings.admin_notify_email,
        title,
        "admin_alert.html",
        {"site": site, "title": title, "rows": rows, "url": url},
    )


def booking_created(booking: Booking, site: dict) -> None:
    b = booking_context(booking)
    send_later(
        booking.contact_email,
        f"Complete your booking {booking.reference} – {booking.tour.title}",
        "booking_created.html",
        {"site": site, "b": b, "hold_minutes": settings.hold_minutes},
    )
    _admin_alert(
        site,
        f"New booking {booking.reference}",
        [
            ("Trip", booking.tour.title),
            ("Customer", f"{booking.contact_name} · {booking.contact_phone}"),
            ("Dates", b["travel_date"]),
            ("Travellers", str(booking.pax)),
            ("Total", b["total"]),
        ],
        f"{settings.frontend_url}/admin/bookings/{booking.reference}",
    )


def payment_received(booking: Booking, payment: Payment, milestone: str | None, site: dict) -> None:
    p = {
        "amount": fmt_money(payment.amount, payment.currency),
        "method_label": METHOD_LABELS.get(payment.method, payment.method),
        "receipt_number": payment.receipt_number,
    }
    send_later(
        booking.contact_email,
        f"Payment received – {booking.reference}",
        "payment_received.html",
        {"site": site, "b": booking_context(booking), "p": p, "milestone": milestone},
    )
    _admin_alert(
        site,
        f"Payment {p['amount']} – {booking.reference}",
        [
            ("Method", p["method_label"]),
            ("Receipt", payment.receipt_number or "-"),
            ("Customer", booking.contact_name),
            ("Booking status", booking.status.replace("_", " ")),
        ],
        f"{settings.frontend_url}/admin/bookings/{booking.reference}",
    )


def balance_reminder(booking: Booking, days: int, site: dict) -> None:
    send_later(
        booking.contact_email,
        f"Balance reminder – {booking.tour.title} ({booking.reference})",
        "balance_reminder.html",
        {"site": site, "b": booking_context(booking), "days": days},
    )


def review_request(booking: Booking, site: dict) -> None:
    send_later(
        booking.contact_email,
        f"How was {booking.tour.title}?",
        "review_request.html",
        {"site": site, "b": booking_context(booking)},
    )


def enquiry_received(enquiry: Enquiry, site: dict) -> None:
    send_later(
        enquiry.email,
        "We've received your travel request",
        "enquiry_received.html",
        {"site": site, "e": {"first_name": enquiry.name.split(" ")[0]}},
    )
    _admin_alert(
        site,
        f"New {enquiry.kind.replace('_', ' ')} enquiry from {enquiry.name}",
        [
            ("Email", enquiry.email),
            ("Phone", enquiry.phone or "-"),
            ("Destinations", ", ".join(enquiry.destinations or []) or "-"),
            ("Travellers", f"{enquiry.adults} adults, {enquiry.children} children"),
            ("Message", (enquiry.message or "")[:400]),
        ],
        f"{settings.frontend_url}/admin/enquiries/{enquiry.id}",
    )
