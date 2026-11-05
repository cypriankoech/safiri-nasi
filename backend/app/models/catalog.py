from datetime import date
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Date,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, TimestampMixin
from app.models.enums import DepartureStatus, Difficulty, PublishStatus, Region, TourType

tour_categories = Table(
    "tour_categories",
    Base.metadata,
    Column("tour_id", ForeignKey("tours.id", ondelete="CASCADE"), primary_key=True),
    Column("category_id", ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True),
)


class Destination(TimestampMixin, Base):
    __tablename__ = "destinations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(140), unique=True, index=True)
    region: Mapped[str] = mapped_column(String(20), default=Region.kenya)
    country: Mapped[str] = mapped_column(String(80), default="Kenya")
    summary: Mapped[str | None] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(Text)
    hero_image: Mapped[str | None] = mapped_column(String(500))
    gallery: Mapped[list] = mapped_column(JSON, default=list)
    best_time: Mapped[str | None] = mapped_column(String(200))
    highlights: Mapped[list] = mapped_column(JSON, default=list)
    latitude: Mapped[float | None]
    longitude: Mapped[float | None]
    featured: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    tours: Mapped[list["Tour"]] = relationship(back_populates="destination")


class Category(TimestampMixin, Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(String(300))
    icon: Mapped[str | None] = mapped_column(String(40))
    image: Mapped[str | None] = mapped_column(String(500))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Tour(TimestampMixin, Base):
    __tablename__ = "tours"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(220), unique=True, index=True)
    summary: Mapped[str] = mapped_column(String(400), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    destination_id: Mapped[int | None] = mapped_column(ForeignKey("destinations.id", ondelete="SET NULL"))
    tour_type: Mapped[str] = mapped_column(String(20), default=TourType.scheduled)
    duration_days: Mapped[int] = mapped_column(Integer, default=1)
    duration_nights: Mapped[int] = mapped_column(Integer, default=0)
    difficulty: Mapped[str] = mapped_column(String(20), default=Difficulty.easy)
    min_group: Mapped[int] = mapped_column(Integer, default=1)
    max_group: Mapped[int] = mapped_column(Integer, default=12)
    start_location: Mapped[str | None] = mapped_column(String(120))
    end_location: Mapped[str | None] = mapped_column(String(120))
    transport: Mapped[str | None] = mapped_column(String(160))
    accommodation_level: Mapped[str | None] = mapped_column(String(40))
    hero_image: Mapped[str | None] = mapped_column(String(500))
    gallery: Mapped[list] = mapped_column(JSON, default=list)
    highlights: Mapped[list] = mapped_column(JSON, default=list)
    inclusions: Mapped[list] = mapped_column(JSON, default=list)
    exclusions: Mapped[list] = mapped_column(JSON, default=list)
    # [{"name": "Nairobi", "lat": -1.29, "lng": 36.82, "day": 1}]
    map_points: Mapped[list] = mapped_column(JSON, default=list)
    # [{"question": "...", "answer": "..."}]
    faqs: Mapped[list] = mapped_column(JSON, default=list)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    deposit_percent: Mapped[int] = mapped_column(Integer, default=30)
    balance_due_days: Mapped[int] = mapped_column(Integer, default=30)
    cancellation_policy: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default=PublishStatus.draft, index=True)
    featured: Mapped[bool] = mapped_column(Boolean, default=False)
    is_deal: Mapped[bool] = mapped_column(Boolean, default=False)
    deal_label: Mapped[str | None] = mapped_column(String(60))
    valid_from: Mapped[date | None] = mapped_column(Date)
    valid_to: Mapped[date | None] = mapped_column(Date)
    seo_title: Mapped[str | None] = mapped_column(String(200))
    seo_description: Mapped[str | None] = mapped_column(String(320))
    rating_avg: Mapped[Decimal] = mapped_column(Numeric(3, 2), default=0)
    rating_count: Mapped[int] = mapped_column(Integer, default=0)
    popularity: Mapped[int] = mapped_column(Integer, default=0)

    destination: Mapped[Destination | None] = relationship(back_populates="tours")
    categories: Mapped[list[Category]] = relationship(secondary=tour_categories)
    itinerary: Mapped[list["ItineraryDay"]] = relationship(
        back_populates="tour", cascade="all, delete-orphan", order_by="ItineraryDay.day_number"
    )
    prices: Mapped[list["TourPrice"]] = relationship(back_populates="tour", cascade="all, delete-orphan")
    departures: Mapped[list["Departure"]] = relationship(
        back_populates="tour", cascade="all, delete-orphan", order_by="Departure.start_date"
    )
    add_ons: Mapped[list["AddOn"]] = relationship(back_populates="tour", cascade="all, delete-orphan")


class ItineraryDay(Base):
    __tablename__ = "itinerary_days"

    id: Mapped[int] = mapped_column(primary_key=True)
    tour_id: Mapped[int] = mapped_column(ForeignKey("tours.id", ondelete="CASCADE"), index=True)
    day_number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    location: Mapped[str | None] = mapped_column(String(120))
    accommodation: Mapped[str | None] = mapped_column(String(200))
    meals: Mapped[str | None] = mapped_column(String(60))
    image: Mapped[str | None] = mapped_column(String(500))

    tour: Mapped[Tour] = relationship(back_populates="itinerary")


class TourPrice(Base):
    """Per-person price for one rate category in one currency."""

    __tablename__ = "tour_prices"
    __table_args__ = (UniqueConstraint("tour_id", "rate_category", "currency"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    tour_id: Mapped[int] = mapped_column(ForeignKey("tours.id", ondelete="CASCADE"), index=True)
    rate_category: Mapped[str] = mapped_column(String(20))
    currency: Mapped[str] = mapped_column(String(3))
    adult_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    child_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    single_supplement: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    compare_at_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))

    tour: Mapped[Tour] = relationship(back_populates="prices")


class Departure(TimestampMixin, Base):
    __tablename__ = "departures"

    id: Mapped[int] = mapped_column(primary_key=True)
    tour_id: Mapped[int] = mapped_column(ForeignKey("tours.id", ondelete="CASCADE"), index=True)
    start_date: Mapped[date] = mapped_column(Date, index=True)
    end_date: Mapped[date] = mapped_column(Date)
    capacity: Mapped[int] = mapped_column(Integer, default=12)
    seats_booked: Mapped[int] = mapped_column(Integer, default=0)
    # Seasonal adjustment applied to the tour's base prices, e.g. +15 for peak migration season.
    price_adjustment_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0)
    status: Mapped[str] = mapped_column(String(20), default=DepartureStatus.open)
    notes: Mapped[str | None] = mapped_column(String(300))

    tour: Mapped[Tour] = relationship(back_populates="departures")

    @property
    def seats_left(self) -> int:
        return max(self.capacity - self.seats_booked, 0)

    @property
    def is_bookable(self) -> bool:
        return (
            self.status in (DepartureStatus.open, DepartureStatus.guaranteed)
            and self.seats_left > 0
            and self.start_date > date.today()
        )


class AddOn(Base):
    __tablename__ = "add_ons"

    id: Mapped[int] = mapped_column(primary_key=True)
    tour_id: Mapped[int] = mapped_column(ForeignKey("tours.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(String(300))
    price_kes: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    price_usd: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    per_person: Mapped[bool] = mapped_column(Boolean, default=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    tour: Mapped[Tour] = relationship(back_populates="add_ons")
