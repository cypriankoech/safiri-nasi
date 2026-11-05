"""Local stand-ins for M-Pesa, Airtel Money and DPO so the whole flow runs without credentials.

Mobile money approves ~6 seconds after initiation (like a customer entering their PIN);
numbers ending in 000 are declined. Card payments go through a tiny hosted page served
by the API (see routers/callbacks.py) where you click Approve or Decline.
"""

import secrets
from datetime import UTC, datetime

from app.config import settings
from app.models import Booking, Payment
from app.payments.base import InitResult, StatusResult

APPROVE_AFTER_SECONDS = 6


class MockMobileMoney:
    def __init__(self, name: str):
        self.name = name

    async def initiate(self, payment: Payment, booking: Booking) -> InitResult:
        label = "M-Pesa" if self.name == "mpesa" else "Airtel Money"
        return InitResult(
            provider_reference=f"MOCK-{secrets.token_hex(6).upper()}",
            message=f"[Test mode] {label} prompt sent to {payment.phone}. Enter your PIN to pay.",
        )

    async def query_status(self, payment: Payment) -> StatusResult:
        if payment.phone and payment.phone.endswith("000"):
            return StatusResult("failed", failure_reason="Request cancelled by user")
        created = payment.created_at or datetime.now(UTC)
        if (datetime.now(UTC) - created).total_seconds() < APPROVE_AFTER_SECONDS:
            return StatusResult("pending")
        prefix = "MP" if self.name == "mpesa" else "AM"
        return StatusResult("success", receipt_number=f"{prefix}{secrets.token_hex(4).upper()}")


class MockCard:
    name = "card"

    async def initiate(self, payment: Payment, booking: Booking) -> InitResult:
        token = f"MOCK-{secrets.token_hex(8).upper()}"
        return InitResult(
            provider_reference=token,
            message="Redirecting to the secure card page…",
            redirect_url=f"{settings.public_api_url}/api/payments/mock/{payment.reference}",
        )

    async def query_status(self, payment: Payment) -> StatusResult:
        decision = (payment.raw or {}).get("mock_decision")
        if decision == "approve":
            return StatusResult("success", receipt_number=f"CARD{secrets.token_hex(4).upper()}")
        if decision == "decline":
            return StatusResult("failed", failure_reason="Card declined by issuer")
        return StatusResult("pending")
