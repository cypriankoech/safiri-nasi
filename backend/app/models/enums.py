from enum import StrEnum


class Role(StrEnum):
    customer = "customer"
    staff = "staff"
    admin = "admin"


class Region(StrEnum):
    kenya = "kenya"
    africa = "africa"
    international = "international"


class TourType(StrEnum):
    scheduled = "scheduled"  # fixed departures with shared seats
    private = "private"  # customer picks the start date
    day_trip = "day_trip"


class Difficulty(StrEnum):
    easy = "easy"
    moderate = "moderate"
    challenging = "challenging"


class PublishStatus(StrEnum):
    draft = "draft"
    published = "published"
    archived = "archived"


class RateCategory(StrEnum):
    resident = "resident"  # Kenyan citizens & East African residents
    non_resident = "non_resident"


class Currency(StrEnum):
    KES = "KES"
    USD = "USD"


class DepartureStatus(StrEnum):
    open = "open"
    guaranteed = "guaranteed"
    sold_out = "sold_out"
    closed = "closed"
    cancelled = "cancelled"


class BookingStatus(StrEnum):
    pending_payment = "pending_payment"
    confirmed = "confirmed"  # deposit received
    fully_paid = "fully_paid"
    completed = "completed"
    cancelled = "cancelled"
    expired = "expired"  # hold lapsed without payment
    refunded = "refunded"


class PaymentPlan(StrEnum):
    deposit = "deposit"
    full = "full"


class PaymentMethod(StrEnum):
    mpesa = "mpesa"
    airtel = "airtel"
    card = "card"
    paybill = "paybill"  # manual M-Pesa Paybill/Till, incl. C2B auto-matched
    bank = "bank"
    cash = "cash"


class PaymentStatus(StrEnum):
    pending = "pending"
    processing = "processing"
    success = "success"
    failed = "failed"
    cancelled = "cancelled"
    refunded = "refunded"


class EnquiryStatus(StrEnum):
    new = "new"
    contacted = "contacted"
    quoted = "quoted"
    won = "won"
    lost = "lost"


class ReviewStatus(StrEnum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class DiscountType(StrEnum):
    percent = "percent"
    fixed = "fixed"
