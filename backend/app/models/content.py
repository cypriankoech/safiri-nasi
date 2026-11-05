from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, TimestampMixin
from app.models.catalog import Tour
from app.models.enums import DiscountType, EnquiryStatus, PublishStatus, ReviewStatus
from app.models.user import User


class Enquiry(TimestampMixin, Base):
    """Tailor-made trip requests and contact-form messages."""

    __tablename__ = "enquiries"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), default="tailor_made")  # tailor_made | contact | tour
    name: Mapped[str] = mapped_column(String(160))
    email: Mapped[str] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(32))
    country: Mapped[str | None] = mapped_column(String(80))
    tour_id: Mapped[int | None] = mapped_column(ForeignKey("tours.id", ondelete="SET NULL"))
    destinations: Mapped[list] = mapped_column(JSON, default=list)
    interests: Mapped[list] = mapped_column(JSON, default=list)
    start_date: Mapped[date | None] = mapped_column(Date)
    flexible_dates: Mapped[bool] = mapped_column(Boolean, default=True)
    duration_days: Mapped[int | None] = mapped_column(Integer)
    adults: Mapped[int] = mapped_column(Integer, default=2)
    children: Mapped[int] = mapped_column(Integer, default=0)
    budget_per_person: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    budget_currency: Mapped[str] = mapped_column(String(3), default="KES")
    accommodation_level: Mapped[str | None] = mapped_column(String(40))
    message: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default=EnquiryStatus.new, index=True)
    assigned_to_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    # [{"at": iso, "by": "Jane", "text": "..."}]
    notes: Mapped[list] = mapped_column(JSON, default=list)
    source: Mapped[str] = mapped_column(String(20), default="web")

    tour: Mapped[Tour | None] = relationship()
    assigned_to: Mapped[User | None] = relationship()


class Review(TimestampMixin, Base):
    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    tour_id: Mapped[int | None] = mapped_column(ForeignKey("tours.id", ondelete="CASCADE"), index=True)
    booking_id: Mapped[int | None] = mapped_column(ForeignKey("bookings.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(120))
    country: Mapped[str | None] = mapped_column(String(80))
    rating: Mapped[int] = mapped_column(Integer)
    title: Mapped[str | None] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text)
    travel_month: Mapped[str | None] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(12), default=ReviewStatus.pending, index=True)
    featured: Mapped[bool] = mapped_column(Boolean, default=False)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)

    tour: Mapped[Tour | None] = relationship()


class PromoCode(TimestampMixin, Base):
    __tablename__ = "promo_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(String(200))
    discount_type: Mapped[str] = mapped_column(String(10), default=DiscountType.percent)
    value: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    currency: Mapped[str | None] = mapped_column(String(3))  # required for fixed discounts
    min_total: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    max_uses: Mapped[int | None] = mapped_column(Integer)
    used_count: Mapped[int] = mapped_column(Integer, default=0)
    valid_from: Mapped[date | None] = mapped_column(Date)
    valid_to: Mapped[date | None] = mapped_column(Date)
    tour_id: Mapped[int | None] = mapped_column(ForeignKey("tours.id", ondelete="CASCADE"))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class BlogPost(TimestampMixin, Base):
    __tablename__ = "blog_posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(220), unique=True, index=True)
    excerpt: Mapped[str | None] = mapped_column(String(400))
    body: Mapped[str] = mapped_column(Text, default="")  # Markdown
    cover_image: Mapped[str | None] = mapped_column(String(500))
    author_name: Mapped[str | None] = mapped_column(String(120))
    tags: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default=PublishStatus.draft, index=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Faq(TimestampMixin, Base):
    __tablename__ = "faqs"

    id: Mapped[int] = mapped_column(primary_key=True)
    question: Mapped[str] = mapped_column(String(300))
    answer: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(60), default="General")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class SiteSetting(Base):
    __tablename__ = "site_settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[dict | list | str | int | float | bool | None] = mapped_column(JSON)


class NewsletterSubscriber(TimestampMixin, Base):
    __tablename__ = "newsletter_subscribers"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    name: Mapped[str | None] = mapped_column(String(160))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(60), index=True)
    entity: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str | None] = mapped_column(String(40))
    summary: Mapped[str | None] = mapped_column(String(300))
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    ip: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    user: Mapped[User | None] = relationship()
