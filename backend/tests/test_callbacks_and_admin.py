"""Provider callbacks (trust nothing until confirmed) and staff-only endpoints."""

from decimal import Decimal

from sqlalchemy import func, select

from app.models import Booking, Payment, UnmatchedPayment
from app.payments.base import StatusResult
from app.services import payments as payment_service
from tests.conftest import booking_payload, make_tour, make_user

SECRET = "test-secret"


class FakeDaraja:
    """Stands in for Safaricom's STK query endpoint."""

    def __init__(self, outcome: str):
        self.outcome = outcome

    async def query_status(self, payment):
        return StatusResult(self.outcome)


async def _booking_with_stk_payment(client, db):
    tour, dep = await make_tour(db)
    body = (await client.post("/api/bookings", json=booking_payload(tour, dep))).json()
    booking = await db.scalar(select(Booking).where(Booking.reference == body["booking"]["reference"]))
    payment = Payment(
        reference="PYSTKTEST01",
        booking_id=booking.id,
        method="mpesa",
        provider="daraja",
        amount=Decimal(18000),
        currency="KES",
        booking_amount=Decimal(18000),
        status="processing",
        phone="254712345678",
        provider_reference="ws_CO_123",
        raw={},
    )
    db.add(payment)
    await db.commit()
    return booking, payment


def _stk_body(result_code=0, receipt="QWE123RTY"):
    items = [{"Name": "Amount", "Value": 18000}, {"Name": "MpesaReceiptNumber", "Value": receipt}]
    return {
        "Body": {
            "stkCallback": {
                "CheckoutRequestID": "ws_CO_123",
                "ResultCode": result_code,
                "ResultDesc": "x",
                "CallbackMetadata": {"Item": items},
            }
        }
    }


async def test_callback_with_wrong_secret_is_rejected(client):
    res = await client.post("/api/callbacks/mpesa/stk/wrong", json=_stk_body())
    assert res.status_code == 404


async def test_stk_success_is_credited_once_after_confirmation(client, db, monkeypatch):
    booking, payment = await _booking_with_stk_payment(client, db)
    monkeypatch.setattr(payment_service, "provider_for", lambda method: FakeDaraja("success"))

    for _ in range(2):  # Safaricom retries callbacks; the second must be a no-op
        res = await client.post(f"/api/callbacks/mpesa/stk/{SECRET}", json=_stk_body())
        assert res.json() == {"ResultCode": 0, "ResultDesc": "Accepted"}

    await db.refresh(payment)
    await db.refresh(booking)
    assert payment.status == "success" and payment.receipt_number == "QWE123RTY"
    assert booking.amount_paid == Decimal(18000)
    assert booking.status == "confirmed"


async def test_spoofed_stk_success_is_ignored_when_query_disagrees(client, db, monkeypatch):
    booking, payment = await _booking_with_stk_payment(client, db)
    monkeypatch.setattr(payment_service, "provider_for", lambda method: FakeDaraja("failed"))
    await client.post(f"/api/callbacks/mpesa/stk/{SECRET}", json=_stk_body())
    await db.refresh(payment)
    await db.refresh(booking)
    assert payment.status == "processing"
    assert booking.amount_paid == 0


async def test_cancelled_stk_marks_payment_failed(client, db):
    _, payment = await _booking_with_stk_payment(client, db)
    await client.post(f"/api/callbacks/mpesa/stk/{SECRET}", json=_stk_body(result_code=1032))
    await db.refresh(payment)
    assert payment.status == "failed"
    assert "cancelled" in payment.failure_reason


async def test_paybill_payment_matches_booking_by_account_number(client, db):
    tour, dep = await make_tour(db)
    body = (await client.post("/api/bookings", json=booking_payload(tour, dep))).json()
    ref = body["booking"]["reference"]
    c2b = {
        "TransID": "RKL1234ABC",
        "TransAmount": "18000.00",
        "BillRefNumber": ref.replace("-", "").lower(),
        "MSISDN": "2547xxxxxx",
        "FirstName": "ACHIENG",
    }
    for _ in range(2):
        res = await client.post(f"/api/callbacks/mpesa/c2b/confirmation/{SECRET}", json=c2b)
        assert res.status_code == 200
    booking = await db.scalar(select(Booking).where(Booking.reference == ref))
    assert booking.status == "confirmed"
    assert (
        await db.scalar(
            select(func.count()).select_from(Payment).where(Payment.receipt_number == "RKL1234ABC")
        )
        == 1
    )


async def test_unrecognised_paybill_payment_waits_for_staff(client, db):
    c2b = {"TransID": "RKL9999XYZ", "TransAmount": "5000", "BillRefNumber": "my trip", "MSISDN": "2547xxxxxx"}
    await client.post(f"/api/callbacks/mpesa/c2b/confirmation/{SECRET}", json=c2b)
    item = await db.scalar(select(UnmatchedPayment))
    assert item.receipt_number == "RKL9999XYZ" and item.resolved is False


async def test_admin_endpoints_require_staff(client, db):
    _, customer = await make_user(db, "customer")
    _, staff = await make_user(db, "staff")
    assert (await client.get("/api/admin/dashboard")).status_code == 401
    assert (await client.get("/api/admin/dashboard", headers=customer)).status_code == 403
    assert (await client.get("/api/admin/dashboard", headers=staff)).status_code == 200
    # Team management is admin-only, even for staff
    assert (await client.get("/api/admin/users", headers=staff)).status_code == 403


async def test_staff_record_manual_payment_and_assign_unmatched(client, db):
    _, staff = await make_user(db, "staff")
    tour, dep = await make_tour(db)
    ref = (await client.post("/api/bookings", json=booking_payload(tour, dep))).json()["booking"]["reference"]

    res = await client.post(
        f"/api/admin/bookings/{ref}/payments",
        headers=staff,
        json={"method": "bank", "amount": "100", "currency": "USD", "receipt_number": "BNK1"},
    )
    assert res.status_code == 201, res.text
    booking = res.json()
    assert booking["amount_paid"] == 12900  # US$100 at 129 credited in KES
    assert booking["status"] == "pending_payment"  # below the 18,000 deposit

    db.add(UnmatchedPayment(provider="daraja", receipt_number="RKLASSIGN1", amount=Decimal(6000), raw={}))
    await db.commit()
    item_id = await db.scalar(select(UnmatchedPayment.id))
    res = await client.post(
        f"/api/admin/unmatched-payments/{item_id}/assign", headers=staff, json={"booking_reference": ref}
    )
    assert res.status_code == 200, res.text
    detail = (await client.get(f"/api/admin/bookings/{ref}", headers=staff)).json()
    assert detail["amount_paid"] == 18900
    assert detail["status"] == "confirmed"


async def test_password_reset_link_works_once(client, db, monkeypatch):
    from app.routers import auth as auth_router

    sent = {}
    monkeypatch.setattr(
        auth_router.notifications, "password_reset", lambda email, name, url, site: sent.update(url=url)
    )
    await make_user(db, "customer", email="reset@example.com")

    unknown = await client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    known = await client.post("/api/auth/forgot-password", json={"email": "RESET@example.com"})
    assert unknown.json() == known.json()  # no account enumeration
    token = sent["url"].split("token=")[1]

    ok = await client.post("/api/auth/reset-password", json={"token": token, "password": "NewPassword#1"})
    assert ok.status_code == 200 and ok.cookies.get("sn_access")
    again = await client.post("/api/auth/reset-password", json={"token": token, "password": "Another#123"})
    assert again.status_code == 400
    login = await client.post(
        "/api/auth/login", json={"email": "reset@example.com", "password": "NewPassword#1"}
    )
    assert login.status_code == 200
