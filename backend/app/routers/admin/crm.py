import csv
import io
from datetime import UTC, date, datetime

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.deps import DB, StaffUser
from app.models import Booking, Enquiry, NewsletterSubscriber, Review, Tour, User
from app.models.enums import Currency, EnquiryStatus, ReviewStatus
from app.schemas.common import ORM, Message, Money
from app.services import site_settings
from app.services.audit import log_action
from app.services.booking import CLOSED_STATUSES

router = APIRouter()


# --- Customers --------------------------------------------------------------------


@router.get("/customers")
async def customers(db: DB, _: StaffUser, q: str | None = None, limit: int = Query(200, le=1000)):
    """Customers are everyone who booked (guest or account), grouped by email."""
    fx = await site_settings.usd_to_kes(db)
    stmt = select(Booking).order_by(Booking.created_at.desc())
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Booking.contact_name.ilike(like),
                Booking.contact_email.ilike(like),
                Booking.contact_phone.ilike(like),
            )
        )
    grouped: dict[str, dict] = {}
    for b in (await db.scalars(stmt)).all():
        email = b.contact_email.lower()
        c = grouped.setdefault(
            email,
            {
                "email": email,
                "name": b.contact_name,
                "phone": b.contact_phone,
                "country": b.contact_country,
                "bookings": 0,
                "trips": 0,
                "spent_kes": 0.0,
                "last_travel_date": None,
                "first_booking": b.created_at,
            },
        )
        c["bookings"] += 1
        if b.status not in CLOSED_STATUSES:
            c["trips"] += 1
        paid = float(b.amount_paid * fx if b.currency == Currency.USD else b.amount_paid)
        c["spent_kes"] += paid
        if c["last_travel_date"] is None or b.travel_date > c["last_travel_date"]:
            c["last_travel_date"] = b.travel_date
        c["first_booking"] = min(c["first_booking"], b.created_at)
    accounts = set(
        e.lower() for e in (await db.scalars(select(User.email).where(User.email.in_(list(grouped))))).all()
    )
    rows = sorted(grouped.values(), key=lambda c: -c["spent_kes"])[:limit]
    for row in rows:
        row["has_account"] = row["email"] in accounts
        row["spent_kes"] = round(row["spent_kes"], 2)
    return rows


@router.get("/customers/{email}")
async def customer_detail(email: str, db: DB, _: StaffUser):
    bookings = (
        await db.scalars(
            select(Booking)
            .where(func.lower(Booking.contact_email) == email.lower())
            .options(selectinload(Booking.tour))
            .order_by(Booking.travel_date.desc())
        )
    ).all()
    if not bookings:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
    user = await db.scalar(select(User).where(func.lower(User.email) == email.lower()))
    enquiries = (
        await db.scalars(
            select(Enquiry)
            .where(func.lower(Enquiry.email) == email.lower())
            .order_by(Enquiry.created_at.desc())
        )
    ).all()
    latest = bookings[0]
    return {
        "email": email.lower(),
        "name": latest.contact_name,
        "phone": latest.contact_phone,
        "country": latest.contact_country,
        "account": {"id": user.id, "created_at": user.created_at, "last_login_at": user.last_login_at}
        if user
        else None,
        "bookings": [
            {
                "reference": b.reference,
                "tour": b.tour.title,
                "travel_date": b.travel_date,
                "status": b.status,
                "currency": b.currency,
                "total": float(b.total),
                "amount_paid": float(b.amount_paid),
                "balance": float(b.balance),
            }
            for b in bookings
        ],
        "enquiries": [
            {"id": e.id, "kind": e.kind, "status": e.status, "created_at": e.created_at, "message": e.message}
            for e in enquiries
        ],
    }


# --- Enquiries --------------------------------------------------------------------


class EnquiryOut(ORM):
    id: int
    kind: str
    name: str
    email: str
    phone: str | None
    country: str | None
    tour_id: int | None
    tour_title: str | None = None
    destinations: list
    interests: list
    start_date: date | None
    flexible_dates: bool
    duration_days: int | None
    adults: int
    children: int
    budget_per_person: Money | None
    budget_currency: str
    accommodation_level: str | None
    message: str | None
    status: str
    assigned_to_id: int | None
    assigned_to_name: str | None = None
    notes: list
    source: str
    created_at: datetime
    updated_at: datetime


def _enquiry_out(e: Enquiry) -> EnquiryOut:
    out = EnquiryOut.model_validate(e)
    out.tour_title = e.tour.title if e.tour else None
    out.assigned_to_name = e.assigned_to.full_name if e.assigned_to else None
    return out


ENQUIRY_OPTIONS = (selectinload(Enquiry.tour), selectinload(Enquiry.assigned_to))


@router.get("/enquiries", response_model=list[EnquiryOut])
async def list_enquiries(
    db: DB, _: StaffUser, status_: str | None = Query(None, alias="status"), q: str | None = None
):
    stmt = select(Enquiry).options(*ENQUIRY_OPTIONS).order_by(Enquiry.created_at.desc())
    if status_:
        stmt = stmt.where(Enquiry.status.in_(status_.split(",")))
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(Enquiry.name.ilike(like), Enquiry.email.ilike(like), Enquiry.message.ilike(like))
        )
    return [_enquiry_out(e) for e in (await db.scalars(stmt.limit(500))).all()]


async def _enquiry(db: DB, enquiry_id: int) -> Enquiry:
    e = await db.scalar(
        select(Enquiry)
        .where(Enquiry.id == enquiry_id)
        .options(*ENQUIRY_OPTIONS)
        .execution_options(populate_existing=True)
    )
    if not e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enquiry not found")
    return e


@router.get("/enquiries/{enquiry_id}", response_model=EnquiryOut)
async def get_enquiry(enquiry_id: int, db: DB, _: StaffUser):
    return _enquiry_out(await _enquiry(db, enquiry_id))


class EnquiryUpdate(BaseModel):
    status: EnquiryStatus | None = None
    assigned_to_id: int | None = None


@router.patch("/enquiries/{enquiry_id}", response_model=EnquiryOut)
async def update_enquiry(enquiry_id: int, data: EnquiryUpdate, db: DB, user: StaffUser):
    e = await _enquiry(db, enquiry_id)
    changes = data.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(e, k, v)
    if "status" in changes:
        e.notes = [
            *e.notes,
            {
                "at": datetime.now(UTC).isoformat(),
                "by": user.full_name,
                "text": f"Status changed to {data.status}",
            },
        ]
    log_action(
        db, user, "enquiry.update", "enquiry", enquiry_id, None, {k: str(v) for k, v in changes.items()}
    )
    await db.commit()
    return _enquiry_out(await _enquiry(db, enquiry_id))


class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@router.post("/enquiries/{enquiry_id}/notes", response_model=EnquiryOut)
async def add_note(enquiry_id: int, data: NoteIn, db: DB, user: StaffUser):
    e = await _enquiry(db, enquiry_id)
    e.notes = [*e.notes, {"at": datetime.now(UTC).isoformat(), "by": user.full_name, "text": data.text}]
    if e.status == EnquiryStatus.new:
        e.status = EnquiryStatus.contacted
    await db.commit()
    return _enquiry_out(await _enquiry(db, enquiry_id))


# --- Reviews ----------------------------------------------------------------------


class AdminReview(ORM):
    id: int
    tour_id: int | None
    tour_title: str | None = None
    booking_id: int | None
    name: str
    country: str | None
    rating: int
    title: str | None
    body: str
    travel_month: str | None
    status: str
    featured: bool
    verified: bool
    created_at: datetime


class ReviewCreate(BaseModel):
    tour_id: int | None = None
    name: str = Field(min_length=2, max_length=120)
    country: str | None = None
    rating: int = Field(ge=1, le=5)
    title: str | None = None
    body: str = Field(min_length=5)
    travel_month: str | None = None
    featured: bool = False


class ReviewUpdate(BaseModel):
    status: ReviewStatus | None = None
    featured: bool | None = None
    title: str | None = None
    body: str | None = None


async def refresh_tour_rating(db: DB, tour_id: int | None) -> None:
    if not tour_id:
        return
    avg, count = (
        await db.execute(
            select(func.avg(Review.rating), func.count()).where(
                Review.tour_id == tour_id, Review.status == ReviewStatus.approved
            )
        )
    ).one()
    tour = await db.get(Tour, tour_id)
    if tour:
        tour.rating_avg = round(avg or 0, 2)
        tour.rating_count = count or 0


def _review_out(r: Review) -> AdminReview:
    out = AdminReview.model_validate(r)
    out.tour_title = r.tour.title if r.tour else None
    return out


@router.get("/reviews", response_model=list[AdminReview])
async def list_reviews(db: DB, _: StaffUser, status_: str | None = Query(None, alias="status")):
    stmt = select(Review).options(selectinload(Review.tour)).order_by(Review.created_at.desc())
    if status_:
        stmt = stmt.where(Review.status == status_)
    return [_review_out(r) for r in (await db.scalars(stmt.limit(500))).all()]


@router.post("/reviews", response_model=AdminReview, status_code=201)
async def create_review(data: ReviewCreate, db: DB, user: StaffUser):
    review = Review(**data.model_dump(), status=ReviewStatus.approved)
    db.add(review)
    await db.flush()
    await refresh_tour_rating(db, review.tour_id)
    log_action(db, user, "review.create", "review", review.id, data.name)
    await db.commit()
    review = await db.scalar(select(Review).where(Review.id == review.id).options(selectinload(Review.tour)))
    return _review_out(review)


@router.patch("/reviews/{review_id}", response_model=AdminReview)
async def update_review(review_id: int, data: ReviewUpdate, db: DB, user: StaffUser):
    review = await db.scalar(select(Review).where(Review.id == review_id).options(selectinload(Review.tour)))
    if not review:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Review not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(review, k, v)
    await db.flush()
    await refresh_tour_rating(db, review.tour_id)
    log_action(db, user, "review.update", "review", review_id, review.status)
    await db.commit()
    return _review_out(review)


@router.delete("/reviews/{review_id}", response_model=Message)
async def delete_review(review_id: int, db: DB, user: StaffUser):
    review = await db.get(Review, review_id)
    if not review:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Review not found")
    tour_id = review.tour_id
    await db.delete(review)
    await db.flush()
    await refresh_tour_rating(db, tour_id)
    log_action(db, user, "review.delete", "review", review_id)
    await db.commit()
    return Message(message="Review deleted")


# --- Newsletter -------------------------------------------------------------------


class SubscriberOut(ORM):
    id: int
    email: EmailStr
    name: str | None
    active: bool
    created_at: datetime


@router.get("/newsletter", response_model=list[SubscriberOut])
async def subscribers(db: DB, _: StaffUser):
    return (
        await db.scalars(select(NewsletterSubscriber).order_by(NewsletterSubscriber.created_at.desc()))
    ).all()


@router.get("/newsletter.csv")
async def subscribers_csv(db: DB, _: StaffUser):
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Email", "Name", "Subscribed"])
    for s in (
        await db.scalars(select(NewsletterSubscriber).where(NewsletterSubscriber.active.is_(True)))
    ).all():
        writer.writerow([s.email, s.name or "", s.created_at.date()])
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="safiri-nasi-subscribers.csv"'},
    )
