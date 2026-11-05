from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.enums import Currency, PaymentPlan, RateCategory
from app.schemas.common import ORM, Money


class QuoteRequest(BaseModel):
    tour_slug: str
    departure_id: int | None = None
    travel_date: date | None = None
    rate_category: RateCategory = RateCategory.resident
    currency: Currency = Currency.KES
    adults: int = Field(default=2, ge=1, le=60)
    children: int = Field(default=0, ge=0, le=60)
    add_on_ids: list[int] = []
    promo_code: str | None = None
    payment_plan: PaymentPlan = PaymentPlan.deposit


class LineItem(BaseModel):
    label: str
    quantity: int
    unit_price: Money
    amount: Money


class QuoteOut(BaseModel):
    tour_id: int
    departure_id: int | None
    travel_date: date
    end_date: date
    rate_category: str
    currency: str
    adults: int
    children: int
    line_items: list[LineItem]
    subtotal: Money
    discount: Money
    promo_code: str | None
    promo_message: str | None
    total: Money
    deposit_percent: int
    deposit_amount: Money
    payment_plan: str
    full_payment_required: bool
    balance_due_date: date | None


class ContactIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    phone: str = Field(min_length=7, max_length=32)
    country: str | None = Field(default=None, max_length=80)


class TravellerIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    traveller_type: Literal["adult", "child"] = "adult"
    nationality: str | None = Field(default=None, max_length=80)
    passport_number: str | None = Field(default=None, max_length=40)
    date_of_birth: date | None = None
    dietary: str | None = Field(default=None, max_length=200)


class BookingCreate(QuoteRequest):
    contact: ContactIn
    travellers: list[TravellerIn] = []
    special_requests: str | None = Field(default=None, max_length=2000)
    accept_terms: bool

    @field_validator("accept_terms")
    @classmethod
    def must_accept(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Please accept the booking terms to continue.")
        return v


class TravellerOut(ORM):
    id: int
    full_name: str
    traveller_type: str
    nationality: str | None
    passport_number: str | None
    date_of_birth: date | None
    dietary: str | None
    is_lead: bool


class PaymentOut(ORM):
    reference: str
    method: str
    provider: str
    amount: Money
    currency: str
    booking_amount: Money
    status: str
    phone: str | None
    receipt_number: str | None
    failure_reason: str | None
    redirect_url: str | None
    notes: str | None
    paid_at: datetime | None
    created_at: datetime


class BookingTour(ORM):
    id: int
    title: str
    slug: str
    hero_image: str | None
    duration_days: int
    duration_nights: int
    start_location: str | None
    transport: str | None


class BookingOut(ORM):
    reference: str
    status: str
    tour: BookingTour
    departure_id: int | None
    travel_date: date
    end_date: date
    adults: int
    children: int
    rate_category: str
    currency: str
    contact_name: str
    contact_email: str
    contact_phone: str
    contact_country: str | None
    special_requests: str | None
    line_items: list[dict]
    add_ons: list[dict]
    subtotal: Money
    discount: Money
    promo_code: str | None
    total: Money
    deposit_amount: Money
    amount_paid: Money
    balance: Money
    amount_due_now: Money
    payment_plan: str
    balance_due_date: date | None
    hold_expires_at: datetime | None
    created_at: datetime
    confirmed_at: datetime | None
    travellers: list[TravellerOut]
    payments: list[PaymentOut]


class BookingCreated(BaseModel):
    booking: BookingOut
    access_token: str


class BookingLookup(BaseModel):
    reference: str
    email: EmailStr


class StartPayment(BaseModel):
    method: Literal["mpesa", "airtel", "card"]
    phone: str | None = None
    pay_full: bool = False
