"""Quotes, seat holds and the booking/payment lifecycle through the public API."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select, update

from app.models import Booking, Departure, Payment, PromoCode
from app.services.jobs import expire_unpaid_holds
from tests.conftest import booking_payload, make_tour


async def test_quote_resident_with_child_and_promo(client, db):
    tour, dep = await make_tour(db)
    db.add(PromoCode(code="KARIBU10", discount_type="percent", value=Decimal(10)))
    await db.commit()
    res = await client.post(
        "/api/quote",
        json={
            "tour_slug": tour.slug,
            "departure_id": dep.id,
            "adults": 2,
            "children": 1,
            "promo_code": "karibu10",
        },
    )
    assert res.status_code == 200, res.text
    q = res.json()
    assert q["subtotal"] == 80000  # 2 × 30,000 + 1 × 20,000
    assert q["discount"] == 8000
    assert q["total"] == 72000
    assert q["deposit_amount"] == 21600  # 30%
    assert q["payment_plan"] == "deposit"


async def test_quote_converts_when_currency_missing_and_applies_peak_season(client, db):
    tour, dep = await make_tour(db, adjustment=Decimal(10))
    res = await client.post(
        "/api/quote",
        json={
            "tour_slug": tour.slug,
            "departure_id": dep.id,
            "adults": 1,
            "rate_category": "non_resident",
            "currency": "KES",
        },
    )
    q = res.json()
    # US$500 × 129 = 64,500, +10% peak = 70,950, plus no single supplement on non-resident prices
    assert q["line_items"][0]["unit_price"] == 70950
    assert q["total"] == 70950


async def test_single_traveller_pays_supplement(client, db):
    tour, dep = await make_tour(db)
    q = (
        await client.post("/api/quote", json={"tour_slug": tour.slug, "departure_id": dep.id, "adults": 1})
    ).json()
    assert [li["label"] for li in q["line_items"]] == ["Adult (Resident)", "Single supplement"]
    assert q["total"] == 35000


async def test_full_payment_required_close_to_departure(client, db):
    tour, dep = await make_tour(db, days_out=10, balance_due_days=30)
    q = (
        await client.post("/api/quote", json={"tour_slug": tour.slug, "departure_id": dep.id, "adults": 2})
    ).json()
    assert q["full_payment_required"] is True
    assert q["deposit_amount"] == q["total"]


async def test_booking_holds_seats_and_blocks_overbooking(client, db):
    tour, dep = await make_tour(db, capacity=3)
    res = await client.post("/api/bookings", json=booking_payload(tour, dep))
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["booking"]["status"] == "pending_payment"
    assert body["access_token"]

    await db.refresh(dep)
    assert dep.seats_booked == 2

    res = await client.post("/api/bookings", json=booking_payload(tour, dep))
    assert res.status_code == 422
    assert "seats left" in res.json()["detail"]


async def test_guest_needs_token_to_view_booking(client, db):
    tour, dep = await make_tour(db)
    body = (await client.post("/api/bookings", json=booking_payload(tour, dep))).json()
    ref = body["booking"]["reference"]
    assert (await client.get(f"/api/bookings/{ref}")).status_code == 404
    ok = await client.get(f"/api/bookings/{ref}", headers={"X-Booking-Token": body["access_token"]})
    assert ok.status_code == 200
    lookup = await client.post(
        "/api/bookings/lookup", json={"reference": ref.lower(), "email": "ACHIENG@example.com"}
    )
    assert lookup.status_code == 200


async def test_deposit_by_mpesa_then_balance_by_card(client, db):
    tour, dep = await make_tour(db)
    body = (await client.post("/api/bookings", json=booking_payload(tour, dep))).json()
    ref, headers = body["booking"]["reference"], {"X-Booking-Token": body["access_token"]}

    pay = (
        await client.post(
            f"/api/bookings/{ref}/payments", headers=headers, json={"method": "mpesa", "phone": "0712345678"}
        )
    ).json()
    assert pay["status"] == "processing"
    assert pay["amount"] == 18000  # 30% of 60,000

    # The mock prompt approves after a few seconds; pretend they have passed.
    await db.execute(
        update(Payment)
        .where(Payment.reference == pay["reference"])
        .values(created_at=datetime.now(UTC) - timedelta(minutes=1))
    )
    await db.commit()
    status = (await client.get(f"/api/payments/{pay['reference']}", headers=headers)).json()
    assert status["payment"]["status"] == "success"
    assert status["booking_status"] == "confirmed"
    assert status["balance"] == 42000

    card = (
        await client.post(f"/api/bookings/{ref}/payments", headers=headers, json={"method": "card"})
    ).json()
    assert card["redirect_url"].endswith(f"/api/payments/mock/{card['reference']}")
    await client.post(f"/api/payments/mock/{card['reference']}", data={"decision": "approve"})
    verified = (await client.post(f"/api/payments/{card['reference']}/verify", headers=headers)).json()
    assert verified["payment"]["status"] == "success"
    assert verified["booking_status"] == "fully_paid"

    for doc in ("invoice.pdf", "voucher.pdf"):
        pdf = await client.get(f"/api/bookings/{ref}/{doc}", headers=headers)
        assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")


async def test_mpesa_rejects_airtel_number(client, db):
    tour, dep = await make_tour(db)
    body = (await client.post("/api/bookings", json=booking_payload(tour, dep))).json()
    res = await client.post(
        f"/api/bookings/{body['booking']['reference']}/payments",
        headers={"X-Booking-Token": body["access_token"]},
        json={"method": "mpesa", "phone": "0733123456"},
    )
    assert res.status_code == 422
    assert "Airtel" in res.json()["detail"]


async def test_expired_hold_releases_seats(client, db):
    tour, dep = await make_tour(db)
    body = (await client.post("/api/bookings", json=booking_payload(tour, dep))).json()
    await db.execute(update(Booking).values(hold_expires_at=datetime.now(UTC) - timedelta(minutes=1)))
    await db.commit()

    await expire_unpaid_holds()

    booking = await db.scalar(
        select(Booking)
        .where(Booking.reference == body["booking"]["reference"])
        .execution_options(populate_existing=True)
    )
    departure = await db.scalar(
        select(Departure).where(Departure.id == dep.id).execution_options(populate_existing=True)
    )
    assert booking.status == "expired"
    assert departure.seats_booked == 0
