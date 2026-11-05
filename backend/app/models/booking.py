from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, TimestampMixin
from app.models.catalog import Departure, Tour
from app.models.enums import BookingStatus, PaymentPlan, PaymentStatus
from app.models.user import User


class Booking(TimestampMixin, Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    tour_id: Mapped[int] = mapped_column(ForeignKey("tours.id", ondelete="RESTRICT"), index=True)
    departure_id: Mapped[int | None] = mapped_column(
        ForeignKey("departures.id", ondelete="SET NULL"), index=True
    )
    travel_date: Mapped[date] = mapped_column(Date, index=True)
    end_date: Mapped[date] = mapped_column(Date)
    adults: Mapped[int] = mapped_column(Integer, default=1)
    children: Mapped[int] = mapped_column(Integer, default=0)
    rate_category: Mapped[str] = mapped_column(String(20))
    currency: Mapped[str] = mapped_column(String(3))

    contact_name: Mapped[str] = mapped_column(String(160))
    contact_email: Mapped[str] = mapped_column(String(255), index=True)
    contact_phone: Mapped[str] = mapped_column(String(32))
    contact_country: Mapped[str | None] = mapped_column(String(80))
    special_requests: Mapped[str | None] = mapped_column(Text)

    # Snapshot of the price breakdown at booking time so later price edits never change it.
    line_items: Mapped[list] = mapped_column(JSON, default=list)
    add_ons: Mapped[list] = mapped_column(JSON, default=list)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    deposit_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    # Derived from successful payments by services.booking.recalculate_payments.
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    payment_plan: Mapped[str] = mapped_column(String(10), default=PaymentPlan.deposit)
    balance_due_date: Mapped[date | None] = mapped_column(Date)
    promo_code: Mapped[str | None] = mapped_column(String(40))

    status: Mapped[str] = mapped_column(String(20), default=BookingStatus.pending_payment, index=True)
    seats_held: Mapped[int] = mapped_column(Integer, default=0)
    hold_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancellation_reason: Mapped[str | None] = mapped_column(String(300))
    source: Mapped[str] = mapped_column(String(20), default="web")
    internal_notes: Mapped[str | None] = mapped_column(Text)
    reminders_sent: Mapped[list] = mapped_column(JSON, default=list)

    tour: Mapped[Tour] = relationship()
    departure: Mapped[Departure | None] = relationship()
    user: Mapped[User | None] = relationship()
    travellers: Mapped[list["Traveller"]] = relationship(
        back_populates="booking", cascade="all, delete-orphan", order_by="Traveller.id"
    )
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="booking", order_by="Payment.created_at", foreign_keys="Payment.booking_id"
    )

    @property
    def pax(self) -> int:
        return self.adults + self.children

    @property
    def amount_due_now(self) -> Decimal:
        """What the customer should pay next: the deposit first, then the balance."""
        if self.status in (BookingStatus.cancelled, BookingStatus.expired, BookingStatus.refunded):
            return Decimal(0)
        if self.payment_plan == PaymentPlan.deposit and self.amount_paid < self.deposit_amount:
            return self.deposit_amount - self.amount_paid
        return max(self.balance, Decimal(0))


class Traveller(Base):
    __tablename__ = "travellers"

    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("bookings.id", ondelete="CASCADE"), index=True)
    full_name: Mapped[str] = mapped_column(String(160))
    traveller_type: Mapped[str] = mapped_column(String(10), default="adult")
    nationality: Mapped[str | None] = mapped_column(String(80))
    passport_number: Mapped[str | None] = mapped_column(String(40))
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    dietary: Mapped[str | None] = mapped_column(String(200))
    is_lead: Mapped[bool] = mapped_column(Boolean, default=False)

    booking: Mapped[Booking] = relationship(back_populates="travellers")


class Payment(TimestampMixin, Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("bookings.id", ondelete="RESTRICT"), index=True)
    method: Mapped[str] = mapped_column(String(10))
    provider: Mapped[str] = mapped_column(String(20))
    # What the customer was charged...
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3))
    # ...and what that is worth in the booking's currency.
    booking_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    fx_rate: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=1)
    status: Mapped[str] = mapped_column(String(12), default=PaymentStatus.pending, index=True)
    phone: Mapped[str | None] = mapped_column(String(20))
    provider_reference: Mapped[str | None] = mapped_column(String(120), index=True)
    receipt_number: Mapped[str | None] = mapped_column(String(80), unique=True)
    failure_reason: Mapped[str | None] = mapped_column(String(300))
    redirect_url: Mapped[str | None] = mapped_column(String(600))
    raw: Mapped[dict] = mapped_column(JSON, default=dict)
    notes: Mapped[str | None] = mapped_column(String(300))
    recorded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    booking: Mapped[Booking] = relationship(back_populates="payments", foreign_keys=[booking_id])
    recorded_by: Mapped[User | None] = relationship()


class ProviderCallback(Base):
    """Raw log of every inbound provider notification, for audits and disputes."""

    __tablename__ = "provider_callbacks"

    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(20), index=True)
    kind: Mapped[str] = mapped_column(String(30))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    remote_ip: Mapped[str | None] = mapped_column(String(64))
    payment_id: Mapped[int | None] = mapped_column(ForeignKey("payments.id", ondelete="SET NULL"))
    processed: Mapped[bool] = mapped_column(Boolean, default=False)
    error: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UnmatchedPayment(TimestampMixin, Base):
    """Paybill/Till money that arrived without a recognisable booking reference."""

    __tablename__ = "unmatched_payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(20))
    receipt_number: Mapped[str] = mapped_column(String(80), unique=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), default="KES")
    phone: Mapped[str | None] = mapped_column(String(80))
    payer_name: Mapped[str | None] = mapped_column(String(160))
    account_reference: Mapped[str | None] = mapped_column(String(80))
    raw: Mapped[dict] = mapped_column(JSON, default=dict)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    resolved_booking_id: Mapped[int | None] = mapped_column(ForeignKey("bookings.id", ondelete="SET NULL"))
    resolved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
