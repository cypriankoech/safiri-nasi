from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORM, Money


class DestinationRef(ORM):
    name: str
    slug: str
    region: str
    country: str


class DestinationOut(ORM):
    id: int
    name: str
    slug: str
    region: str
    country: str
    summary: str | None
    hero_image: str | None
    featured: bool
    latitude: float | None
    longitude: float | None
    tour_count: int = 0


class DestinationDetail(DestinationOut):
    description: str | None
    gallery: list[str]
    best_time: str | None
    highlights: list[str]


class CategoryOut(ORM):
    id: int
    name: str
    slug: str
    description: str | None
    icon: str | None
    image: str | None
    tour_count: int = 0


class PriceOut(ORM):
    rate_category: str
    currency: str
    adult_price: Money
    child_price: Money | None
    single_supplement: Money | None
    compare_at_price: Money | None


class FromPrice(BaseModel):
    amount: Money
    compare_at: Money | None
    currency: str
    rate_category: str


class DepartureOut(ORM):
    id: int
    start_date: date
    end_date: date
    capacity: int
    seats_left: int
    status: str
    price_adjustment_percent: Money
    is_bookable: bool


class ItineraryDayOut(ORM):
    day_number: int
    title: str
    description: str
    location: str | None
    accommodation: str | None
    meals: str | None
    image: str | None


class AddOnOut(ORM):
    id: int
    name: str
    description: str | None
    price_kes: Money
    price_usd: Money
    per_person: bool


class CategoryRef(ORM):
    name: str
    slug: str


class TourCard(ORM):
    id: int
    title: str
    slug: str
    summary: str
    hero_image: str | None
    duration_days: int
    duration_nights: int
    tour_type: str
    difficulty: str
    accommodation_level: str | None
    destination: DestinationRef | None
    categories: list[CategoryRef]
    tags: list[str]
    rating_avg: Money
    rating_count: int
    featured: bool
    is_deal: bool
    deal_label: str | None
    valid_to: date | None
    from_price: FromPrice | None = None
    next_departure: date | None = None
    next_departure_seats: int | None = None


class TourDetail(TourCard):
    description: str
    gallery: list[str]
    highlights: list[str]
    inclusions: list[str]
    exclusions: list[str]
    map_points: list[dict]
    faqs: list[dict]
    start_location: str | None
    end_location: str | None
    transport: str | None
    min_group: int
    max_group: int
    deposit_percent: int
    balance_due_days: int
    cancellation_policy: str | None
    seo_title: str | None
    seo_description: str | None
    valid_from: date | None
    itinerary: list[ItineraryDayOut]
    prices: list[PriceOut]
    departures: list[DepartureOut] = []
    add_ons: list[AddOnOut] = []


class ReviewOut(ORM):
    id: int
    name: str
    country: str | None
    rating: int
    title: str | None
    body: str
    travel_month: str | None
    verified: bool
    created_at: datetime
    tour_title: str | None = None
    tour_slug: str | None = None


class ReviewIn(BaseModel):
    booking_reference: str
    token: str | None = None
    email: str | None = None
    rating: int = Field(ge=1, le=5)
    title: str | None = Field(default=None, max_length=160)
    body: str = Field(min_length=10, max_length=4000)
    name: str | None = Field(default=None, max_length=120)
    country: str | None = Field(default=None, max_length=80)
