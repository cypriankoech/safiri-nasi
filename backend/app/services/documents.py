"""PDF invoices, receipts and travel vouchers rendered with WeasyPrint."""

from datetime import date
from decimal import Decimal
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from starlette.concurrency import run_in_threadpool
from weasyprint import HTML

from app.config import settings
from app.models import Booking, Payment
from app.models.enums import PaymentStatus, RateCategory
from app.services.notifications import METHOD_LABELS, fmt_date, fmt_money

APP_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = APP_DIR / "static"
TEMPLATES = Environment(
    loader=FileSystemLoader(APP_DIR / "templates" / "pdf"), autoescape=select_autoescape(["html"])
)

STATUS_LABELS = {
    "pending_payment": "Awaiting payment",
    "confirmed": "Confirmed – deposit paid",
    "fully_paid": "Fully paid",
    "completed": "Completed",
    "cancelled": "Cancelled",
    "expired": "Expired",
    "refunded": "Refunded",
}


def _common(booking: Booking, site: dict) -> dict:
    currency = booking.currency

    def fmt(value) -> str:
        return fmt_money(Decimal(str(value)), currency)

    return {
        "b": booking,
        "site": site,
        "fmt": fmt,
        "issued": fmt_date(date.today()),
        "dates": f"{fmt_date(booking.travel_date)} – {fmt_date(booking.end_date)}",
        "balance_due": fmt_date(booking.balance_due_date),
        "status_label": STATUS_LABELS.get(booking.status, booking.status),
        "rate_label": "Resident" if booking.rate_category == RateCategory.resident else "Non-resident",
        "manage_url_short": settings.frontend_url.replace("https://", "").replace("http://", "")
        + f"/booking/{booking.reference}",
    }


async def _render(template: str, context: dict) -> bytes:
    html = TEMPLATES.get_template(template).render(**context)
    return await run_in_threadpool(lambda: HTML(string=html, base_url=str(STATIC_DIR)).write_pdf())


async def invoice_pdf(booking: Booking, site: dict) -> bytes:
    payments = [
        {
            "date": fmt_date(p.paid_at),
            "method": METHOD_LABELS.get(p.method, p.method),
            "receipt": p.receipt_number or p.reference,
            "amount": fmt_money(p.amount, p.currency),
        }
        for p in booking.payments
        if p.status == PaymentStatus.success
    ]
    return await _render("invoice.html", {**_common(booking, site), "payments": payments})


async def receipt_pdf(booking: Booking, payment: Payment, site: dict) -> bytes:
    context = {
        **_common(booking, site),
        "p": payment,
        "method": METHOD_LABELS.get(payment.method, payment.method),
        "paid_on": fmt_date(payment.paid_at),
        "amount": fmt_money(payment.amount, payment.currency),
    }
    return await _render("receipt.html", context)


async def voucher_pdf(booking: Booking, site: dict) -> bytes:
    return await _render("voucher.html", _common(booking, site))
