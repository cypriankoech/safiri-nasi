from dataclasses import dataclass, field
from decimal import Decimal
from typing import Literal, Protocol

from app.models import Booking, Payment

Outcome = Literal["success", "failed", "pending"]


class ProviderError(Exception):
    """Raised when a provider rejects a request; the message is safe to show customers."""


@dataclass
class InitResult:
    provider_reference: str | None
    message: str
    redirect_url: str | None = None
    raw: dict = field(default_factory=dict)


@dataclass
class StatusResult:
    outcome: Outcome
    receipt_number: str | None = None
    failure_reason: str | None = None
    raw: dict = field(default_factory=dict)
    gateway_fee: Decimal | None = None  # what the gateway kept, in the charged currency


class PaymentProvider(Protocol):
    name: str

    async def initiate(self, payment: Payment, booking: Booking) -> InitResult: ...

    async def query_status(self, payment: Payment) -> StatusResult: ...
