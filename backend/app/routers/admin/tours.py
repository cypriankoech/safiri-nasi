import csv
import io
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from slugify import slugify
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.deps import DB, StaffUser, client_ip
from app.models import AddOn, Booking, Category, Departure, ItineraryDay, Tour, TourPrice
from app.models.enums import (
    Currency,
    DepartureStatus,
    Difficulty,
    PublishStatus,
    RateCategory,
    TourType,
)
from app.schemas.catalog import TourDetail
from app.schemas.common import ORM, Message, Money
from app.services.audit import log_action
from app.services.booking import CLOSED_STATUSES

router = APIRouter()


class ItineraryDayIn(BaseModel):
    day_number: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    location: str | None = None
    accommodation: str | None = None
    meals: str | None = None
    image: str | None = None


class PriceIn(BaseModel):
    rate_category: RateCategory
    currency: Currency
    adult_price: Decimal = Field(ge=0)
    child_price: Decimal | None = Field(default=None, ge=0)
    single_supplement: Decimal | None = Field(default=None, ge=0)
    compare_at_price: Decimal | None = Field(default=None, ge=0)


class AddOnIn(BaseModel):
    id: int | None = None
    name: str = Field(min_length=1, max_length=160)
    description: str | None = None
    price_kes: Decimal = Decimal(0)
    price_usd: Decimal = Decimal(0)
    per_person: bool = True
    active: bool = True


class TourIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    slug: str | None = None
    summary: str = ""
    description: str = ""
    destination_id: int | None = None
    category_ids: list[int] = []
    tour_type: TourType = TourType.scheduled
    duration_days: int = Field(default=1, ge=1, le=60)
    duration_nights: int = Field(default=0, ge=0, le=60)
    difficulty: Difficulty = Difficulty.easy
    min_group: int = Field(default=1, ge=1)
    max_group: int = Field(default=12, ge=1)
    start_location: str | None = None
    end_location: str | None = None
    transport: str | None = None
    accommodation_level: str | None = None
    hero_image: str | None = None
    gallery: list[str] = []
    highlights: list[str] = []
    inclusions: list[str] = []
    exclusions: list[str] = []
    map_points: list[dict] = []
    faqs: list[dict] = []
    tags: list[str] = []
    deposit_percent: int = Field(default=30, ge=0, le=100)
    balance_due_days: int = Field(default=30, ge=0, le=365)
    cancellation_policy: str | None = None
    status: PublishStatus = PublishStatus.draft
    featured: bool = False
    is_deal: bool = False
    deal_label: str | None = None
    valid_from: date | None = None
    valid_to: date | None = None
    seo_title: str | None = None
    seo_description: str | None = None
    itinerary: list[ItineraryDayIn] = []
    prices: list[PriceIn] = []
    add_ons: list[AddOnIn] = []


class AdminAddOn(ORM):
    id: int
    name: str
    description: str | None
    price_kes: Money
    price_usd: Money
    per_person: bool
    active: bool


class AdminTour(TourDetail):
    status: str
    destination_id: int | None
    category_ids: list[int] = []
    add_ons: list[AdminAddOn] = []  # type: ignore[assignment]
    bookings_count: int = 0


class TourRow(ORM):
    id: int
    title: str
    slug: str
    status: str
    tour_type: str
    duration_days: int
    featured: bool
    is_deal: bool
    hero_image: str | None
    destination_name: str | None = None
    from_kes: Money | None = None
    upcoming_departures: int = 0
    bookings_count: int = 0


TOUR_OPTIONS = (
    selectinload(Tour.destination),
    selectinload(Tour.categories),
    selectinload(Tour.prices),
    selectinload(Tour.departures),
    selectinload(Tour.itinerary),
    selectinload(Tour.add_ons),
)


async def _load_tour(db: DB, tour_id: int) -> Tour:
    tour = await db.scalar(
        select(Tour)
        .where(Tour.id == tour_id)
        .options(*TOUR_OPTIONS)
        .execution_options(populate_existing=True)
    )
    if not tour:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tour not found")
    return tour


async def _bookings_count(db: DB, tour_id: int) -> int:
    return await db.scalar(select(func.count()).where(Booking.tour_id == tour_id)) or 0


async def _serialize(db: DB, tour: Tour) -> AdminTour:
    out = AdminTour.model_validate(tour)
    out.category_ids = [c.id for c in tour.categories]
    out.bookings_count = await _bookings_count(db, tour.id)
    return out


async def _unique_slug(db: DB, base: str, exclude_id: int | None = None) -> str:
    slug, n = base, 2
    while True:
        stmt = select(Tour.id).where(Tour.slug == slug)
        if exclude_id:
            stmt = stmt.where(Tour.id != exclude_id)
        if not await db.scalar(stmt):
            return slug
        slug, n = f"{base}-{n}", n + 1


async def _apply(db: DB, tour: Tour, data: TourIn) -> None:
    payload = data.model_dump(exclude={"slug", "category_ids", "itinerary", "prices", "add_ons"})
    for key, value in payload.items():
        setattr(tour, key, value)
    tour.slug = await _unique_slug(db, slugify(data.slug or data.title), tour.id)
    tour.categories = list(
        (await db.scalars(select(Category).where(Category.id.in_(data.category_ids)))).all()
    )
    tour.itinerary = [
        ItineraryDay(**d.model_dump()) for d in sorted(data.itinerary, key=lambda d: d.day_number)
    ]
    seen = set()
    prices = []
    for p in data.prices:
        key = (p.rate_category, p.currency)
        if key in seen:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, f"Duplicate price for {key[0]} {key[1]}"
            )
        seen.add(key)
        prices.append(TourPrice(**p.model_dump()))
    tour.prices = prices
    existing = {a.id: a for a in tour.add_ons}
    kept = []
    for a in data.add_ons:
        values = a.model_dump(exclude={"id"})
        if a.id and a.id in existing:
            for k, v in values.items():
                setattr(existing[a.id], k, v)
            kept.append(existing[a.id])
        else:
            kept.append(AddOn(**values))
    tour.add_ons = kept


@router.get("/tours", response_model=list[TourRow])
async def list_tours(
    db: DB, _: StaffUser, q: str | None = None, status_: str | None = Query(None, alias="status")
):
    stmt = select(Tour).options(
        selectinload(Tour.destination), selectinload(Tour.prices), selectinload(Tour.departures)
    )
    if q:
        stmt = stmt.where(Tour.title.ilike(f"%{q}%"))
    if status_:
        stmt = stmt.where(Tour.status == status_)
    tours = (await db.scalars(stmt.order_by(Tour.updated_at.desc()))).all()
    counts = dict((await db.execute(select(Booking.tour_id, func.count()).group_by(Booking.tour_id))).all())
    rows = []
    for t in tours:
        row = TourRow.model_validate(t)
        row.destination_name = t.destination.name if t.destination else None
        kes = [p.adult_price for p in t.prices if p.currency == Currency.KES]
        row.from_kes = min(kes) if kes else None
        row.upcoming_departures = sum(1 for d in t.departures if d.start_date >= date.today())
        row.bookings_count = counts.get(t.id, 0)
        rows.append(row)
    return rows


@router.get("/tours/{tour_id}", response_model=AdminTour)
async def get_tour(tour_id: int, db: DB, _: StaffUser):
    return await _serialize(db, await _load_tour(db, tour_id))


@router.post("/tours", response_model=AdminTour, status_code=201)
async def create_tour(data: TourIn, db: DB, user: StaffUser, request: Request):
    tour = Tour(title=data.title, slug="tmp")
    tour.categories, tour.itinerary, tour.prices, tour.add_ons = [], [], [], []
    db.add(tour)
    await _apply(db, tour, data)
    await db.flush()
    log_action(db, user, "tour.create", "tour", tour.id, tour.title, ip=client_ip(request))
    await db.commit()
    return await _serialize(db, await _load_tour(db, tour.id))


@router.put("/tours/{tour_id}", response_model=AdminTour)
async def update_tour(tour_id: int, data: TourIn, db: DB, user: StaffUser, request: Request):
    tour = await _load_tour(db, tour_id)
    await _apply(db, tour, data)
    log_action(db, user, "tour.update", "tour", tour.id, tour.title, ip=client_ip(request))
    await db.commit()
    return await _serialize(db, await _load_tour(db, tour_id))


@router.post("/tours/{tour_id}/duplicate", response_model=AdminTour, status_code=201)
async def duplicate_tour(tour_id: int, db: DB, user: StaffUser):
    src = await _load_tour(db, tour_id)
    data = TourIn.model_validate(
        {
            **{c.key: getattr(src, c.key) for c in Tour.__table__.columns if c.key not in ("id", "slug")},
            "title": f"{src.title} (copy)",
            "status": PublishStatus.draft,
            "featured": False,
            "category_ids": [c.id for c in src.categories],
            "itinerary": [ItineraryDayIn.model_validate(d, from_attributes=True) for d in src.itinerary],
            "prices": [PriceIn.model_validate(p, from_attributes=True) for p in src.prices],
            "add_ons": [
                AddOnIn.model_validate(a, from_attributes=True).model_copy(update={"id": None})
                for a in src.add_ons
            ],
        }
    )
    tour = Tour(title=data.title, slug="tmp")
    tour.categories, tour.itinerary, tour.prices, tour.add_ons = [], [], [], []
    db.add(tour)
    await _apply(db, tour, data)
    await db.flush()
    log_action(db, user, "tour.duplicate", "tour", tour.id, f"Copied from {src.title}")
    await db.commit()
    return await _serialize(db, await _load_tour(db, tour.id))


@router.delete("/tours/{tour_id}", response_model=Message)
async def delete_tour(tour_id: int, db: DB, user: StaffUser, request: Request):
    tour = await _load_tour(db, tour_id)
    if await _bookings_count(db, tour_id):
        tour.status = PublishStatus.archived
        log_action(db, user, "tour.archive", "tour", tour.id, tour.title, ip=client_ip(request))
        await db.commit()
        return Message(message="Tour has bookings, so it was archived instead of deleted.")
    log_action(db, user, "tour.delete", "tour", tour.id, tour.title, ip=client_ip(request))
    await db.delete(tour)
    await db.commit()
    return Message(message="Tour deleted")


# --- Departures -------------------------------------------------------------------


class DepartureIn(BaseModel):
    tour_id: int
    start_date: date
    end_date: date | None = None
    capacity: int = Field(default=12, ge=1, le=500)
    price_adjustment_percent: Decimal = Field(default=Decimal(0), ge=-90, le=500)
    status: DepartureStatus = DepartureStatus.open
    notes: str | None = None


class DepartureUpdate(BaseModel):
    start_date: date | None = None
    end_date: date | None = None
    capacity: int | None = Field(default=None, ge=1, le=500)
    price_adjustment_percent: Decimal | None = None
    status: DepartureStatus | None = None
    notes: str | None = None


class DepartureBulkIn(BaseModel):
    tour_id: int
    first_date: date
    last_date: date
    every_days: int = Field(default=7, ge=1, le=365)
    capacity: int = Field(default=12, ge=1, le=500)
    price_adjustment_percent: Decimal = Decimal(0)


class DepartureRow(ORM):
    id: int
    tour_id: int
    tour_title: str = ""
    tour_slug: str = ""
    start_date: date
    end_date: date
    capacity: int
    seats_booked: int
    seats_left: int
    status: str
    price_adjustment_percent: Money
    notes: str | None
    bookings: int = 0
    revenue: dict[str, float] = {}


@router.get("/departures", response_model=list[DepartureRow])
async def list_departures(
    db: DB,
    _: StaffUser,
    tour_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    include_past: bool = False,
):
    stmt = select(Departure).options(selectinload(Departure.tour)).order_by(Departure.start_date)
    if tour_id:
        stmt = stmt.where(Departure.tour_id == tour_id)
    if date_from:
        stmt = stmt.where(Departure.start_date >= date_from)
    elif not include_past:
        stmt = stmt.where(Departure.start_date >= date.today() - timedelta(days=7))
    if date_to:
        stmt = stmt.where(Departure.start_date <= date_to)
    departures = (await db.scalars(stmt.limit(500))).all()
    ids = [d.id for d in departures]
    stats: dict[int, dict] = {}
    if ids:
        rows = await db.execute(
            select(Booking.departure_id, Booking.currency, func.count(), func.sum(Booking.amount_paid))
            .where(Booking.departure_id.in_(ids), Booking.status.not_in(CLOSED_STATUSES))
            .group_by(Booking.departure_id, Booking.currency)
        )
        for dep_id, currency, count, paid in rows.all():
            s = stats.setdefault(dep_id, {"bookings": 0, "revenue": {}})
            s["bookings"] += count
            s["revenue"][currency] = float(paid or 0)
    out = []
    for d in departures:
        row = DepartureRow.model_validate(d)
        row.tour_title, row.tour_slug = d.tour.title, d.tour.slug
        row.bookings = stats.get(d.id, {}).get("bookings", 0)
        row.revenue = stats.get(d.id, {}).get("revenue", {})
        out.append(row)
    return out


async def _tour_or_404(db: DB, tour_id: int) -> Tour:
    tour = await db.get(Tour, tour_id)
    if not tour:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tour not found")
    return tour


@router.post("/departures", response_model=DepartureRow, status_code=201)
async def create_departure(data: DepartureIn, db: DB, user: StaffUser):
    tour = await _tour_or_404(db, data.tour_id)
    end = data.end_date or data.start_date + timedelta(days=max(tour.duration_days - 1, 0))
    departure = Departure(**data.model_dump(exclude={"end_date"}), end_date=end)
    db.add(departure)
    await db.flush()
    log_action(db, user, "departure.create", "departure", departure.id, f"{tour.title} {data.start_date}")
    await db.commit()
    departure = await db.scalar(
        select(Departure).where(Departure.id == departure.id).options(selectinload(Departure.tour))
    )
    row = DepartureRow.model_validate(departure)
    row.tour_title, row.tour_slug = tour.title, tour.slug
    return row


@router.post("/departures/bulk", response_model=Message, status_code=201)
async def bulk_departures(data: DepartureBulkIn, db: DB, user: StaffUser):
    tour = await _tour_or_404(db, data.tour_id)
    if data.last_date < data.first_date or (data.last_date - data.first_date).days > 730:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose a date range of up to two years.")
    existing = set((await db.scalars(select(Departure.start_date).where(Departure.tour_id == tour.id))).all())
    created, day = 0, data.first_date
    while day <= data.last_date:
        if day not in existing:
            db.add(
                Departure(
                    tour_id=tour.id,
                    start_date=day,
                    end_date=day + timedelta(days=max(tour.duration_days - 1, 0)),
                    capacity=data.capacity,
                    price_adjustment_percent=data.price_adjustment_percent,
                )
            )
            created += 1
        day += timedelta(days=data.every_days)
    log_action(db, user, "departure.bulk_create", "tour", tour.id, f"{created} departures for {tour.title}")
    await db.commit()
    return Message(message=f"Created {created} departures.")


@router.patch("/departures/{departure_id}", response_model=Message)
async def update_departure(departure_id: int, data: DepartureUpdate, db: DB, user: StaffUser):
    departure = await db.get(Departure, departure_id)
    if not departure:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Departure not found")
    changes = data.model_dump(exclude_unset=True)
    if "capacity" in changes and changes["capacity"] < departure.seats_booked:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, f"{departure.seats_booked} seats are already booked."
        )
    for k, v in changes.items():
        setattr(departure, k, v)
    log_action(
        db, user, "departure.update", "departure", departure.id, None, {k: str(v) for k, v in changes.items()}
    )
    await db.commit()
    return Message(message="Departure updated")


@router.delete("/departures/{departure_id}", response_model=Message)
async def delete_departure(departure_id: int, db: DB, user: StaffUser):
    departure = await db.get(Departure, departure_id)
    if not departure:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Departure not found")
    active = await db.scalar(
        select(func.count()).where(
            Booking.departure_id == departure_id, Booking.status.not_in(CLOSED_STATUSES)
        )
    )
    if active:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This departure has active bookings. Cancel it instead so customers are kept.",
        )
    log_action(db, user, "departure.delete", "departure", departure.id, str(departure.start_date))
    await db.delete(departure)
    await db.commit()
    return Message(message="Departure deleted")


async def _manifest(db: DB, departure_id: int) -> tuple[Departure, list[dict]]:
    departure = await db.scalar(
        select(Departure).where(Departure.id == departure_id).options(selectinload(Departure.tour))
    )
    if not departure:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Departure not found")
    bookings = (
        await db.scalars(
            select(Booking)
            .where(Booking.departure_id == departure_id, Booking.status.not_in(CLOSED_STATUSES))
            .options(selectinload(Booking.travellers))
            .order_by(Booking.created_at)
        )
    ).all()
    rows = []
    for b in bookings:
        for t in b.travellers or []:
            rows.append(
                {
                    "booking": b.reference,
                    "status": b.status,
                    "name": t.full_name,
                    "type": t.traveller_type,
                    "nationality": t.nationality or "",
                    "passport": t.passport_number or "",
                    "dietary": t.dietary or "",
                    "contact_phone": b.contact_phone,
                    "contact_email": b.contact_email,
                    "balance": f"{b.currency} {b.balance:,.2f}",
                }
            )
        missing = b.pax - len(b.travellers or [])
        for i in range(max(missing, 0)):
            rows.append(
                {
                    "booking": b.reference,
                    "status": b.status,
                    "name": f"{b.contact_name} – guest {i + 1}",
                    "type": "",
                    "nationality": "",
                    "passport": "",
                    "dietary": "",
                    "contact_phone": b.contact_phone,
                    "contact_email": b.contact_email,
                    "balance": f"{b.currency} {b.balance:,.2f}",
                }
            )
    return departure, rows


@router.get("/departures/{departure_id}/manifest")
async def manifest(departure_id: int, db: DB, _: StaffUser):
    departure, rows = await _manifest(db, departure_id)
    return {
        "tour": departure.tour.title,
        "start_date": departure.start_date,
        "end_date": departure.end_date,
        "travellers": rows,
    }


@router.get("/departures/{departure_id}/manifest.csv")
async def manifest_csv(departure_id: int, db: DB, _: StaffUser):
    departure, rows = await _manifest(db, departure_id)
    buf = io.StringIO()
    fields = [
        "booking",
        "status",
        "name",
        "type",
        "nationality",
        "passport",
        "dietary",
        "contact_phone",
        "contact_email",
        "balance",
    ]
    writer = csv.DictWriter(buf, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)
    filename = f"manifest-{departure.tour.slug}-{departure.start_date}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
