import json
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.deps import DB, OptionalUser
from app.models import (
    BlogPost,
    Booking,
    Category,
    Departure,
    Destination,
    Enquiry,
    Faq,
    NewsletterSubscriber,
    Review,
    Tour,
    tour_categories,
)
from app.models.enums import BookingStatus, Currency, PublishStatus, RateCategory, ReviewStatus
from app.schemas.booking import QuoteOut, QuoteRequest
from app.schemas.catalog import (
    AddOnOut,
    CategoryOut,
    DepartureOut,
    DestinationDetail,
    DestinationOut,
    FromPrice,
    ReviewIn,
    ReviewOut,
    TourCard,
    TourDetail,
)
from app.schemas.common import Message, Page
from app.schemas.content import BlogCard, BlogPostOut, EnquiryIn, FaqOut, NewsletterIn
from app.security import decode_token
from app.services import notifications, site_settings
from app.services.pricing import QuoteError, build_quote, from_price

router = APIRouter(prefix="/api", tags=["public"])

TOUR_CARD_OPTIONS = (
    selectinload(Tour.destination),
    selectinload(Tour.categories),
    selectinload(Tour.prices),
    selectinload(Tour.departures),
)


def upcoming_departures(tour: Tour) -> list[Departure]:
    return [d for d in tour.departures if d.is_bookable]


def tour_card(tour: Tour, currency: str, rate: str, fx: Decimal, model=TourCard):
    card = model.model_validate(tour)
    price = from_price(tour, rate, currency, fx)
    card.from_price = FromPrice(**price) if price else None
    resident = from_price(tour, RateCategory.resident, Currency.KES, fx)
    visitor = from_price(tour, RateCategory.non_resident, Currency.USD, fx)
    card.resident_from = FromPrice(**resident) if resident else None
    card.non_resident_from = FromPrice(**visitor) if visitor else None
    upcoming = upcoming_departures(tour)
    if upcoming:
        card.next_departure = upcoming[0].start_date
        card.next_departure_seats = upcoming[0].seats_left
    return card


async def published_tours(db: DB, *filters) -> list[Tour]:
    stmt = select(Tour).where(Tour.status == PublishStatus.published, *filters).options(*TOUR_CARD_OPTIONS)
    return list((await db.scalars(stmt)).unique().all())


@router.get("/site")
async def site_info(db: DB):
    settings_ = await site_settings.get_all(db)
    categories = await list_categories(db)
    destinations = (
        await db.scalars(select(Destination).order_by(Destination.sort_order, Destination.name))
    ).all()
    return {
        "settings": settings_,
        "categories": categories,
        "destinations": [
            {"name": d.name, "slug": d.slug, "region": d.region, "featured": d.featured} for d in destinations
        ],
    }


@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(db: DB):
    counts = dict(
        (
            await db.execute(
                select(tour_categories.c.category_id, func.count())
                .join(Tour, Tour.id == tour_categories.c.tour_id)
                .where(Tour.status == PublishStatus.published)
                .group_by(tour_categories.c.category_id)
            )
        ).all()
    )
    out = []
    for c in (await db.scalars(select(Category).order_by(Category.sort_order, Category.name))).all():
        item = CategoryOut.model_validate(c)
        item.tour_count = counts.get(c.id, 0)
        out.append(item)
    return out


async def _destination_counts(db: DB) -> dict[int, int]:
    rows = await db.execute(
        select(Tour.destination_id, func.count())
        .where(Tour.status == PublishStatus.published)
        .group_by(Tour.destination_id)
    )
    return dict(rows.all())


@router.get("/destinations", response_model=list[DestinationOut])
async def list_destinations(db: DB, region: str | None = None, featured: bool | None = None):
    stmt = select(Destination).order_by(Destination.sort_order, Destination.name)
    if region:
        stmt = stmt.where(Destination.region == region)
    if featured is not None:
        stmt = stmt.where(Destination.featured == featured)
    counts = await _destination_counts(db)
    out = []
    for d in (await db.scalars(stmt)).all():
        item = DestinationOut.model_validate(d)
        item.tour_count = counts.get(d.id, 0)
        out.append(item)
    return out


@router.get("/destinations/{slug}")
async def get_destination(
    slug: str, db: DB, currency: Currency = Currency.KES, rate: RateCategory = RateCategory.resident
):
    destination = await db.scalar(select(Destination).where(Destination.slug == slug))
    if not destination:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Destination not found")
    fx = await site_settings.usd_to_kes(db)
    tours = await published_tours(db, Tour.destination_id == destination.id)
    detail = DestinationDetail.model_validate(destination)
    detail.tour_count = len(tours)
    return {
        "destination": detail,
        "tours": [tour_card(t, currency, rate, fx) for t in sorted(tours, key=lambda t: -t.popularity)],
    }


SortKey = Literal["popular", "price_asc", "price_desc", "duration", "rating", "newest", "departure"]


@router.get("/tours", response_model=Page[TourCard])
async def list_tours(
    db: DB,
    q: str | None = None,
    destination: str | None = None,
    category: str | None = None,
    region: str | None = None,
    tour_type: str | None = None,
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    min_days: int | None = None,
    max_days: int | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    deals: bool | None = None,
    featured: bool | None = None,
    currency: Currency = Currency.KES,
    rate: RateCategory = RateCategory.resident,
    sort: SortKey = "popular",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=60),
):
    filters = []
    if q:
        like = f"%{q.strip()}%"
        filters.append(
            or_(
                Tour.title.ilike(like),
                Tour.summary.ilike(like),
                Tour.destination.has(Destination.name.ilike(like)),
            )
        )
    if destination:
        filters.append(Tour.destination.has(Destination.slug == destination))
    if region:
        filters.append(Tour.destination.has(Destination.region == region))
    if category:
        filters.append(Tour.categories.any(Category.slug == category))
    if tour_type:
        filters.append(Tour.tour_type == tour_type)
    if min_days:
        filters.append(Tour.duration_days >= min_days)
    if max_days:
        filters.append(Tour.duration_days <= max_days)
    if deals:
        filters.append(Tour.is_deal.is_(True))
    if featured:
        filters.append(Tour.featured.is_(True))

    fx = await site_settings.usd_to_kes(db)
    tours = await published_tours(db, *filters)
    if month:
        year, mon = (int(x) for x in month.split("-"))

        def runs_in_month(tour: Tour) -> bool:
            if tour.tour_type != "scheduled":
                return True  # private trips run on any date
            return any(
                d.start_date.year == year and d.start_date.month == mon for d in upcoming_departures(tour)
            )

        tours = [t for t in tours if runs_in_month(t)]
    cards = [tour_card(t, currency, rate, fx) for t in tours]
    if min_price is not None:
        cards = [c for c in cards if c.from_price and c.from_price.amount >= Decimal(str(min_price))]
    if max_price is not None:
        cards = [c for c in cards if c.from_price and c.from_price.amount <= Decimal(str(max_price))]

    big = Decimal("1e12")
    sorters = {
        "popular": lambda c: (not c.featured, -c.rating_count, c.title),
        "price_asc": lambda c: c.from_price.amount if c.from_price else big,
        "price_desc": lambda c: -(c.from_price.amount if c.from_price else 0),
        "duration": lambda c: c.duration_days,
        "rating": lambda c: (-c.rating_avg, -c.rating_count),
        "newest": lambda c: -c.id,
        "departure": lambda c: c.next_departure or date.max,
    }
    cards.sort(key=sorters[sort])
    start = (page - 1) * page_size
    return Page(items=cards[start : start + page_size], total=len(cards), page=page, page_size=page_size)


@router.get("/search/suggest")
async def search_suggest(db: DB, q: str = Query(min_length=2)):
    like = f"%{q.strip()}%"
    tours = (
        await db.scalars(
            select(Tour)
            .where(Tour.status == PublishStatus.published, Tour.title.ilike(like))
            .order_by(Tour.popularity.desc())
            .limit(6)
        )
    ).all()
    destinations = (await db.scalars(select(Destination).where(Destination.name.ilike(like)).limit(4))).all()
    return {
        "tours": [{"title": t.title, "slug": t.slug, "hero_image": t.hero_image} for t in tours],
        "destinations": [{"name": d.name, "slug": d.slug, "region": d.region} for d in destinations],
    }


@router.get("/tours/{slug}", response_model=TourDetail)
async def get_tour(
    slug: str,
    db: DB,
    currency: Currency = Currency.KES,
    rate: RateCategory = RateCategory.resident,
    preview: bool = False,
    user: OptionalUser = None,
):
    stmt = (
        select(Tour)
        .where(Tour.slug == slug)
        .options(*TOUR_CARD_OPTIONS, selectinload(Tour.itinerary), selectinload(Tour.add_ons))
    )
    tour = await db.scalar(stmt)
    can_preview = preview and user is not None and user.is_staff
    if not tour or (tour.status != PublishStatus.published and not can_preview):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tour not found")
    fx = await site_settings.usd_to_kes(db)
    detail = tour_card(tour, currency, rate, fx, model=TourDetail)
    detail.departures = [
        DepartureOut.model_validate(d) for d in tour.departures if d.start_date > date.today()
    ][:24]
    detail.add_ons = [AddOnOut.model_validate(a) for a in tour.add_ons if a.active]
    return detail


@router.get("/tours/{slug}/related", response_model=list[TourCard])
async def related_tours(
    slug: str, db: DB, currency: Currency = Currency.KES, rate: RateCategory = RateCategory.resident
):
    tour = await db.scalar(select(Tour).where(Tour.slug == slug).options(selectinload(Tour.categories)))
    if not tour:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tour not found")
    category_ids = [c.id for c in tour.categories]
    candidates = await published_tours(
        db,
        Tour.id != tour.id,
        or_(Tour.destination_id == tour.destination_id, Tour.categories.any(Category.id.in_(category_ids))),
    )
    candidates.sort(key=lambda t: (t.destination_id != tour.destination_id, -t.popularity))
    fx = await site_settings.usd_to_kes(db)
    return [tour_card(t, currency, rate, fx) for t in candidates[:4]]


@router.get("/tours/{slug}/reviews", response_model=Page[ReviewOut])
async def tour_reviews(slug: str, db: DB, page: int = 1, page_size: int = 6):
    tour_id = await db.scalar(select(Tour.id).where(Tour.slug == slug))
    if not tour_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tour not found")
    base = select(Review).where(Review.tour_id == tour_id, Review.status == ReviewStatus.approved)
    total = await db.scalar(select(func.count()).select_from(base.subquery()))
    rows = (
        await db.scalars(
            base.order_by(Review.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
        )
    ).all()
    return Page(items=rows, total=total or 0, page=page, page_size=page_size)


@router.post("/tours/{slug}/reviews", response_model=Message, status_code=201)
async def submit_review(slug: str, data: ReviewIn, db: DB, user: OptionalUser):
    tour = await db.scalar(select(Tour).where(Tour.slug == slug))
    if not tour:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tour not found")
    booking = await db.scalar(
        select(Booking).where(
            Booking.reference == data.booking_reference.strip().upper(), Booking.tour_id == tour.id
        )
    )
    if not booking:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "We couldn't find that booking for this tour.")
    token_ok = (
        bool(data.token) and (decode_token(data.token, "booking") or {}).get("ref") == booking.reference
    )
    email_ok = bool(data.email) and data.email.lower() == booking.contact_email.lower()
    user_ok = user is not None and (user.id == booking.user_id or user.email == booking.contact_email)
    if not (token_ok or email_ok or user_ok):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Please use the link from your email to leave a review."
        )
    if booking.status not in (BookingStatus.completed, BookingStatus.fully_paid, BookingStatus.confirmed):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reviews open once your trip is confirmed.")
    if await db.scalar(select(Review.id).where(Review.booking_id == booking.id)):
        raise HTTPException(status.HTTP_409_CONFLICT, "You've already reviewed this trip. Thank you!")
    db.add(
        Review(
            tour_id=tour.id,
            booking_id=booking.id,
            name=data.name or booking.contact_name,
            country=data.country or booking.contact_country,
            rating=data.rating,
            title=data.title,
            body=data.body,
            travel_month=booking.travel_date.strftime("%B %Y"),
            verified=True,
        )
    )
    await db.commit()
    return Message(message="Thanks! Your review will appear once our team has checked it.")


@router.get("/reviews/featured", response_model=list[ReviewOut])
async def featured_reviews(db: DB, limit: int = 6):
    rows = (
        await db.scalars(
            select(Review)
            .where(Review.status == ReviewStatus.approved, Review.featured.is_(True))
            .options(selectinload(Review.tour))
            .order_by(Review.created_at.desc())
            .limit(limit)
        )
    ).all()
    out = []
    for r in rows:
        item = ReviewOut.model_validate(r)
        if r.tour:
            item.tour_title, item.tour_slug = r.tour.title, r.tour.slug
        out.append(item)
    return out


@router.get("/departures/upcoming")
async def upcoming(
    db: DB,
    limit: int = 8,
    currency: Currency = Currency.KES,
    rate: RateCategory = RateCategory.resident,
):
    rows = (
        await db.scalars(
            select(Departure)
            .join(Tour)
            .where(
                Tour.status == PublishStatus.published,
                Departure.start_date > date.today(),
                Departure.status.in_(["open", "guaranteed"]),
                Departure.seats_booked < Departure.capacity,
            )
            .order_by(Departure.start_date)
            .limit(limit)
            .options(selectinload(Departure.tour).options(*TOUR_CARD_OPTIONS))
        )
    ).all()
    fx = await site_settings.usd_to_kes(db)
    return [
        {"departure": DepartureOut.model_validate(d), "tour": tour_card(d.tour, currency, rate, fx)}
        for d in rows
    ]


@router.post("/quote", response_model=QuoteOut)
async def quote(data: QuoteRequest, db: DB):
    tour = await db.scalar(
        select(Tour)
        .where(Tour.slug == data.tour_slug, Tour.status == PublishStatus.published)
        .options(selectinload(Tour.prices), selectinload(Tour.add_ons))
    )
    if not tour:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tour not found")
    departure = await db.get(Departure, data.departure_id) if data.departure_id else None
    try:
        result = await build_quote(
            db,
            tour,
            rate_category=data.rate_category,
            currency=data.currency,
            adults=data.adults,
            children=data.children,
            departure=departure,
            travel_date=data.travel_date,
            add_on_ids=data.add_on_ids,
            promo_code=data.promo_code,
            payment_plan=data.payment_plan,
        )
    except QuoteError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    return result.as_dict()


@router.get("/faqs", response_model=list[FaqOut])
async def faqs(db: DB, category: str | None = None):
    stmt = select(Faq).where(Faq.active.is_(True)).order_by(Faq.category, Faq.sort_order)
    if category:
        stmt = stmt.where(Faq.category == category)
    return (await db.scalars(stmt)).all()


@router.get("/blog", response_model=Page[BlogCard])
async def blog(db: DB, page: int = 1, page_size: int = 9, tag: str | None = None):
    base = select(BlogPost).where(BlogPost.status == PublishStatus.published)
    posts = (await db.scalars(base.order_by(BlogPost.published_at.desc()))).all()
    if tag:
        posts = [p for p in posts if tag in (p.tags or [])]
    start = (page - 1) * page_size
    return Page(items=posts[start : start + page_size], total=len(posts), page=page, page_size=page_size)


@router.get("/blog/{slug}", response_model=BlogPostOut)
async def blog_post(slug: str, db: DB):
    post = await db.scalar(
        select(BlogPost).where(BlogPost.slug == slug, BlogPost.status == PublishStatus.published)
    )
    if not post:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    return post


@router.post("/enquiries", response_model=Message, status_code=201)
async def create_enquiry(data: EnquiryIn, db: DB):
    tour_id = None
    if data.tour_slug:
        tour_id = await db.scalar(select(Tour.id).where(Tour.slug == data.tour_slug))
    enquiry = Enquiry(**data.model_dump(exclude={"tour_slug"}), tour_id=tour_id)
    enquiry.email = enquiry.email.lower()
    db.add(enquiry)
    await db.commit()
    notifications.enquiry_received(enquiry, await site_settings.get_all(db))
    return Message(message="Thank you! A travel expert will be in touch within one working day.")


@router.post("/newsletter", response_model=Message, status_code=201)
async def subscribe(data: NewsletterIn, db: DB):
    existing = await db.scalar(
        select(NewsletterSubscriber).where(func.lower(NewsletterSubscriber.email) == data.email.lower())
    )
    if existing:
        existing.active = True
    else:
        db.add(NewsletterSubscriber(email=data.email.lower(), name=data.name))
    await db.commit()
    return Message(message="You're on the list! Watch your inbox for deals and travel inspiration.")


@router.get("/health")
async def health():
    return {"status": "ok", "time": datetime.now(UTC).isoformat()}


@router.get("/photo-credits")
async def photo_credits():
    """Attribution for the Wikimedia Commons photos used in the seed catalogue."""
    images = json.loads((Path(__file__).resolve().parent.parent / "seed_images.json").read_text())
    return [
        {
            "title": v["title"].removeprefix("File:").rsplit(".", 1)[0],
            "url": v["thumb"],
            "source": v["page"],
            "license": v["license"],
            "artist": v["artist"],
        }
        for v in images.values()
    ]
