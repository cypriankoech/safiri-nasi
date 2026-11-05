"""Inbound notifications from Safaricom, Airtel and DPO, plus the mock card page.

Every callback URL carries CALLBACK_SECRET in its path, every payload is logged in
provider_callbacks, and no payment is credited without a server-side status check.
"""

import hmac
import logging
from html import escape

from defusedxml import ElementTree
from fastapi import APIRouter, Form, HTTPException, Request, status
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse
from sqlalchemy import select

from app.config import settings
from app.deps import DB, client_ip
from app.models import Booking, Payment
from app.models.enums import PaymentMethod, PaymentStatus
from app.services import payments as payment_service
from app.services.notifications import fmt_money

log = logging.getLogger(__name__)
router = APIRouter(tags=["callbacks"])

DARAJA_ACK = {"ResultCode": 0, "ResultDesc": "Accepted"}


def _check_secret(secret: str) -> None:
    if not hmac.compare_digest(secret, settings.callback_secret):
        raise HTTPException(status.HTTP_404_NOT_FOUND)


def _check_mpesa_ip(request: Request) -> None:
    if settings.mpesa_allowed_ips and client_ip(request) not in settings.mpesa_allowed_ips:
        log.warning("Rejected M-Pesa callback from %s", client_ip(request))
        raise HTTPException(status.HTTP_403_FORBIDDEN)


async def _json(request: Request) -> dict:
    try:
        body = await request.json()
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}


@router.post("/api/callbacks/mpesa/stk/{secret}")
async def mpesa_stk(secret: str, request: Request, db: DB):
    _check_secret(secret)
    _check_mpesa_ip(request)
    try:
        await payment_service.handle_mpesa_stk_callback(db, await _json(request), client_ip(request))
    except Exception:
        log.exception("STK callback processing failed")
        await db.rollback()
    return DARAJA_ACK


@router.post("/api/callbacks/mpesa/c2b/validation/{secret}")
async def mpesa_c2b_validation(secret: str, request: Request):
    _check_secret(secret)
    _check_mpesa_ip(request)
    # Accept everything; unrecognised account numbers land in the unmatched-payments queue.
    return {"ResultCode": "0", "ResultDesc": "Accepted"}


@router.post("/api/callbacks/mpesa/c2b/confirmation/{secret}")
async def mpesa_c2b_confirmation(secret: str, request: Request, db: DB):
    _check_secret(secret)
    _check_mpesa_ip(request)
    try:
        await payment_service.handle_c2b_confirmation(db, await _json(request), client_ip(request))
    except Exception:
        log.exception("C2B confirmation processing failed")
        await db.rollback()
    return DARAJA_ACK


@router.post("/api/callbacks/airtel/{secret}")
async def airtel(secret: str, request: Request, db: DB):
    _check_secret(secret)
    try:
        await payment_service.handle_airtel_callback(db, await _json(request), client_ip(request))
    except Exception:
        log.exception("Airtel callback processing failed")
        await db.rollback()
    return JSONResponse({"status": "received"})


@router.post("/api/callbacks/dpo/{secret}")
async def dpo_push(secret: str, request: Request, db: DB):
    _check_secret(secret)
    raw = (await request.body()).decode(errors="replace")
    payload: dict = {"raw": raw[:4000]}
    try:
        root = ElementTree.fromstring(raw)
        payload = {child.tag: (child.text or "").strip() for child in root}
    except ElementTree.ParseError:
        pass
    entry = payment_service.log_callback(db, "dpo", "push", payload, client_ip(request))
    payment = None
    if payload.get("CompanyRef"):
        payment = await db.scalar(select(Payment).where(Payment.reference == payload["CompanyRef"]))
    elif payload.get("TransactionToken"):
        payment = await db.scalar(
            select(Payment).where(Payment.provider_reference == payload["TransactionToken"])
        )
    await db.commit()
    if payment and payment.method == PaymentMethod.card:
        entry.payment_id = payment.id
        entry.processed = True
        await payment_service.refresh_payment(db, payment, force=True)
    return PlainTextResponse("OK")


# --- Mock card checkout (PAYMENTS_MODE=mock only) ---------------------------------

MOCK_PAGE = """<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Test card payment</title><style>
body{{font-family:system-ui,sans-serif;background:#FBF6EC;margin:0;display:grid;place-items:center;min-height:100vh;color:#22261F}}
.card{{background:#fff;border-radius:18px;padding:28px;max-width:380px;width:calc(100% - 32px);box-shadow:0 10px 40px #1E3B1C22}}
h1{{font-size:18px;margin:0 0 4px;color:#1E3B1C}}.amt{{font-size:30px;font-weight:800;margin:14px 0}}
.muted{{color:#6b7163;font-size:13px}}.pill{{display:inline-block;background:#FDEFD6;color:#8A5300;border-radius:99px;padding:2px 10px;font-size:12px;font-weight:700}}
input{{width:100%;box-sizing:border-box;padding:12px;border:1px solid #E3D9C2;border-radius:10px;margin:6px 0;font-size:15px}}
.row{{display:flex;gap:8px}}button{{flex:1;padding:13px;border:0;border-radius:999px;font-weight:700;font-size:15px;cursor:pointer}}
.ok{{background:#7DC242;color:#1E3B1C}}.no{{background:#F1E9D8;color:#7A2A2A}}</style></head><body>
<form class="card" method="post"><span class="pill">TEST MODE · no real money</span>
<h1 style="margin-top:12px">Safiri Nasi – card payment</h1><div class="muted">Booking {booking} · {payment}</div>
<div class="amt">{amount}</div>
<input value="4111 1111 1111 1111" aria-label="Card number" readonly>
<div class="row"><input value="12/30" aria-label="Expiry" readonly><input value="123" aria-label="CVV" readonly></div>
<div class="row" style="margin-top:14px"><button class="no" name="decision" value="decline">Decline</button>
<button class="ok" name="decision" value="approve">Pay now</button></div></form></body></html>"""


async def _mock_payment(db: DB, reference: str) -> Payment:
    if settings.payments_mode != "mock":
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    payment = await db.scalar(select(Payment).where(Payment.reference == reference))
    if not payment or payment.method != PaymentMethod.card:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return payment


@router.get("/api/payments/mock/{reference}", response_class=HTMLResponse)
async def mock_card_page(reference: str, db: DB):
    payment = await _mock_payment(db, reference)
    booking = await db.get(Booking, payment.booking_id)
    return MOCK_PAGE.format(
        booking=escape(booking.reference),
        payment=escape(payment.reference),
        amount=escape(fmt_money(payment.amount, payment.currency)),
    )


@router.post("/api/payments/mock/{reference}")
async def mock_card_submit(reference: str, db: DB, decision: str = Form(...)):
    payment = await _mock_payment(db, reference)
    if payment.status == PaymentStatus.processing:
        payment.raw = {
            **(payment.raw or {}),
            "mock_decision": "approve" if decision == "approve" else "decline",
        }
        await db.commit()
    return RedirectResponse(
        f"{settings.frontend_url}/payment/return?payment={payment.reference}",
        status_code=status.HTTP_303_SEE_OTHER,
    )
