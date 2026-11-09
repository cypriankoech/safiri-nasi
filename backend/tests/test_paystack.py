"""Paystack provider: split parameters, verification and signed webhooks (against a fake API)."""

import hashlib
import hmac
import json
from decimal import Decimal
from types import SimpleNamespace

import httpx
import pytest
from sqlalchemy import select

from app.config import settings
from app.models import Booking, Payment
from app.payments import paystack
from app.payments.base import ProviderError
from app.services import payments as payment_service
from tests.conftest import booking_payload, make_tour

SECRET = "sk_test_unit"


@pytest.fixture
def live_paystack(monkeypatch):
    monkeypatch.setattr(settings, "payments_mode", "sandbox")
    monkeypatch.setattr(settings, "payment_gateway", "paystack")
    monkeypatch.setattr(settings, "paystack_secret_key", SECRET)
    monkeypatch.setattr(settings, "paystack_platform_subaccount", "ACCT_astralyn")
    monkeypatch.setattr(settings, "paystack_platform_percent", Decimal(5))


def fake_paystack(responses: dict, seen: list):
    """httpx client whose requests are answered from `responses` keyed by (METHOD, path)."""

    def handler(request: httpx.Request):
        body = json.loads(request.content) if request.content else None
        seen.append((request.method, request.url.path, body, request.headers.get("authorization")))
        status, payload = responses[(request.method, request.url.path)]
        return httpx.Response(status, json=payload)

    return httpx.AsyncClient(base_url=paystack.BASE_URL, transport=httpx.MockTransport(handler))


def _payment(method="mpesa", amount="10000", currency="KES", phone="254712345678"):
    return SimpleNamespace(reference="PYTESTREF01", amount=Decimal(amount), currency=currency, phone=phone)


BOOKING = SimpleNamespace(
    contact_email="guest@example.com",
    contact_name="Guest",
    reference="SN-AAAAAA",
    tour=SimpleNamespace(title="Safari"),
)


def test_split_sends_partner_exactly_five_percent(live_paystack):
    assert paystack.split_params(Decimal("10000")) == {
        "subaccount": "ACCT_astralyn",
        "transaction_charge": 950000,  # KES 9,500 stays with Safiri Nasi, KES 500 to Astralyn
        "bearer": "account",  # Safiri Nasi pays Paystack's fee
    }


def test_no_split_until_subaccount_is_configured(live_paystack, monkeypatch):
    monkeypatch.setattr(settings, "paystack_platform_subaccount", "")
    assert paystack.split_params(Decimal("10000")) == {}
    assert paystack.platform_share(Decimal("10000")) == 0


def test_mock_mode_still_records_the_share(monkeypatch):
    monkeypatch.setattr(settings, "payments_mode", "mock")
    monkeypatch.setattr(settings, "paystack_platform_subaccount", "")
    assert paystack.platform_share(Decimal("21450")) == Decimal("1072.50")


async def test_mpesa_charge_payload(live_paystack):
    seen: list = []
    client = fake_paystack(
        {
            ("POST", "/charge"): (
                200,
                {
                    "status": True,
                    "data": {"id": 99, "status": "pay_offline", "display_text": "Check your phone"},
                },
            )
        },
        seen,
    )
    result = await paystack.PaystackProvider("mpesa", client).initiate(_payment(), BOOKING)
    method, path, body, auth = seen[0]
    assert (method, path, auth) == ("POST", "/charge", f"Bearer {SECRET}")
    assert body["amount"] == 1000000 and body["currency"] == "KES"
    assert body["mobile_money"] == {"phone": "+254712345678", "provider": "mpesa"}
    assert body["subaccount"] == "ACCT_astralyn" and body["transaction_charge"] == 950000
    assert body["reference"] == "PYTESTREF01"
    assert result.message == "Check your phone"


async def test_failed_charge_raises_friendly_error(live_paystack):
    client = fake_paystack(
        {
            ("POST", "/charge"): (
                200,
                {"status": True, "data": {"status": "failed", "gateway_response": "Declined"}},
            )
        },
        [],
    )
    with pytest.raises(ProviderError, match="M-Pesa: Declined"):
        await paystack.PaystackProvider("mpesa", client).initiate(_payment(), BOOKING)


async def test_card_uses_hosted_checkout(live_paystack):
    seen: list = []
    client = fake_paystack(
        {
            ("POST", "/transaction/initialize"): (
                200,
                {
                    "status": True,
                    "data": {"authorization_url": "https://checkout.paystack.com/abc", "access_code": "abc"},
                },
            )
        },
        seen,
    )
    result = await paystack.PaystackProvider("card", client).initiate(_payment("card", "500", "USD"), BOOKING)
    body = seen[0][2]
    assert body["channels"] == ["card"] and body["currency"] == "USD" and body["amount"] == 50000
    assert body["callback_url"].endswith("/payment/return?payment=PYTESTREF01")
    assert result.redirect_url == "https://checkout.paystack.com/abc"


async def test_verify_maps_statuses_and_fees(live_paystack):
    def provider(status, data):
        return paystack.PaystackProvider(
            "mpesa",
            fake_paystack(
                {("GET", "/transaction/verify/PYTESTREF01"): (status, {"status": True, "data": data})}, []
            ),
        )

    ok = await provider(
        200,
        {
            "status": "success",
            "amount": 1000000,
            "currency": "KES",
            "fees": 15000,
            "id": 7,
            "receipt_number": "QWE123",
        },
    ).query_status(_payment())
    assert (ok.outcome, ok.receipt_number, ok.gateway_fee) == ("success", "QWE123", Decimal(150))

    short = await provider(200, {"status": "success", "amount": 100, "currency": "KES"}).query_status(
        _payment()
    )
    assert short.outcome == "failed"  # never credit a payment whose amount doesn't match

    assert (await provider(200, {"status": "abandoned"}).query_status(_payment())).outcome == "failed"
    assert (await provider(200, {"status": "pay_offline"}).query_status(_payment())).outcome == "pending"
    assert (await provider(404, {}).query_status(_payment())).outcome == "pending"


def test_webhook_signature(live_paystack):
    body = b'{"event":"charge.success"}'
    good = hmac.new(SECRET.encode(), body, hashlib.sha512).hexdigest()
    assert paystack.signature_valid(body, good)
    assert not paystack.signature_valid(body, "forged")
    assert not paystack.signature_valid(body, None)


async def test_signed_webhook_credits_payment_with_fee_and_share(client, db, live_paystack, monkeypatch):
    tour, dep = await make_tour(db)
    ref = (await client.post("/api/bookings", json=booking_payload(tour, dep))).json()["booking"]["reference"]
    booking = await db.scalar(select(Booking).where(Booking.reference == ref))
    payment = Payment(
        reference="PYWEBHOOK01",
        booking_id=booking.id,
        method="mpesa",
        provider="paystack",
        amount=Decimal(18000),
        currency="KES",
        booking_amount=Decimal(18000),
        status="processing",
        platform_share=Decimal(900),
        raw={},
    )
    db.add(payment)
    await db.commit()

    verify = {
        "status": "success",
        "amount": 1800000,
        "currency": "KES",
        "fees": 27000,
        "id": 1,
        "receipt_number": "RCP1",
    }
    fake = paystack.PaystackProvider(
        "mpesa",
        fake_paystack(
            {("GET", "/transaction/verify/PYWEBHOOK01"): (200, {"status": True, "data": verify})}, []
        ),
    )
    monkeypatch.setattr(payment_service, "provider_for", lambda method: fake)

    event = json.dumps({"event": "charge.success", "data": {"reference": "PYWEBHOOK01"}}).encode()
    forged = await client.post(
        "/api/callbacks/paystack", content=event, headers={"x-paystack-signature": "bad"}
    )
    assert forged.status_code == 200
    await db.refresh(payment)
    assert payment.status == "processing"  # unsigned events change nothing

    signature = hmac.new(SECRET.encode(), event, hashlib.sha512).hexdigest()
    await client.post("/api/callbacks/paystack", content=event, headers={"x-paystack-signature": signature})
    await db.refresh(payment)
    await db.refresh(booking)
    assert payment.status == "success" and payment.receipt_number == "RCP1"
    assert payment.gateway_fee == Decimal(270) and payment.platform_share == Decimal(900)
    assert booking.status == "confirmed"
