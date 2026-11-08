import os

# Configure before the app (and its engine) is imported.
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://safiri:safiri@localhost:5434/safiri_nasi_test"
)
os.environ.update(
    ENVIRONMENT="test",
    SEND_EMAILS="false",
    SCHEDULER_ENABLED="false",
    PAYMENTS_MODE="mock",
    CALLBACK_SECRET="test-secret",
)

from datetime import date, timedelta  # noqa: E402
from decimal import Decimal  # noqa: E402

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

import app.models  # noqa: E402,F401
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Departure, Tour, TourPrice, User  # noqa: E402
from app.security import create_access_token, hash_password  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
async def schema():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


@pytest.fixture(autouse=True)
async def clean_tables():
    yield
    tables = ", ".join(f'"{t.name}"' for t in reversed(Base.metadata.sorted_tables))
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


@pytest.fixture
async def db():
    async with SessionLocal() as session:
        yield session


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def make_tour(
    db,
    *,
    tour_type: str = "scheduled",
    deposit_percent: int = 30,
    balance_due_days: int = 30,
    capacity: int = 6,
    days_out: int = 90,
    adjustment: Decimal = Decimal(0),
) -> tuple[Tour, Departure | None]:
    tour = Tour(
        title="Test Safari",
        slug=f"test-safari-{tour_type}",
        tour_type=tour_type,
        duration_days=3,
        duration_nights=2,
        max_group=8,
        deposit_percent=deposit_percent,
        balance_due_days=balance_due_days,
        status="published",
    )
    tour.prices = [
        TourPrice(
            rate_category="resident",
            currency="KES",
            adult_price=Decimal(30000),
            child_price=Decimal(20000),
            single_supplement=Decimal(5000),
        ),
        TourPrice(
            rate_category="non_resident", currency="USD", adult_price=Decimal(500), child_price=Decimal(350)
        ),
    ]
    departure = None
    if tour_type == "scheduled":
        start = date.today() + timedelta(days=days_out)
        departure = Departure(
            start_date=start,
            end_date=start + timedelta(days=2),
            capacity=capacity,
            price_adjustment_percent=adjustment,
        )
        tour.departures = [departure]
    db.add(tour)
    await db.commit()
    await db.refresh(tour)
    if departure:
        await db.refresh(departure)  # refreshing the tour cascades and expires its departures
    return tour, departure


async def make_user(db, role: str = "customer", email: str | None = None) -> tuple[User, dict]:
    user = User(
        email=email or f"{role}@example.com",
        full_name=f"Test {role}",
        role=role,
        password_hash=hash_password("Password#123"),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user, {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


def booking_payload(tour: Tour, departure: Departure | None, **overrides) -> dict:
    payload = {
        "tour_slug": tour.slug,
        "departure_id": departure.id if departure else None,
        "travel_date": None if departure else (date.today() + timedelta(days=60)).isoformat(),
        "adults": 2,
        "children": 0,
        "rate_category": "resident",
        "currency": "KES",
        "contact": {"name": "Achieng Otieno", "email": "achieng@example.com", "phone": "0712345678"},
        "travellers": [{"full_name": "Achieng Otieno"}, {"full_name": "Juma Otieno"}],
        "accept_terms": True,
    }
    payload.update(overrides)
    return payload
