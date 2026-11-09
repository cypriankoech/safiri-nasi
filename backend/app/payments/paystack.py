"""Paystack: M-Pesa and Airtel Money (Charge API prompt) and cards (hosted checkout), with a
revenue split on every payment.

Split model: Safiri Nasi owns the Paystack account (main account). The platform partner
(Astralyn) is a Paystack subaccount. Each payment passes `subaccount` plus `transaction_charge`
(the main account's share, in subunits), so the subaccount receives exactly the configured
percentage, and `bearer="account"` puts Paystack's fee on the main account.

Docs: https://paystack.com/docs/payments/multi-split-payments/ and /docs/api/charge/.
Amounts are in subunits (cents): KES 2,000 is sent as 200000.
"""

import hashlib
import hmac
from decimal import ROUND_HALF_UP, Decimal

import httpx

from app.config import settings
from app.models import Booking, Payment
from app.models.enums import PaymentMethod
from app.payments.base import InitResult, ProviderError, StatusResult

BASE_URL = "https://api.paystack.co"
PENDING = {"pending", "ongoing", "processing", "queued", "pay_offline", "send_otp", "send_pin", "send_phone"}
FAILED = {"failed", "abandoned", "reversed", "timeout"}


def to_subunits(amount: Decimal) -> int:
    return int((Decimal(amount) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def platform_share(amount: Decimal) -> Decimal:
    """The partner's cut of a payment, in the charged currency (0 when no split is configured)."""
    if settings.paystack_platform_percent <= 0:
        return Decimal(0)
    # Real payments can only be split once the partner's subaccount exists; mock mode still
    # records the share so demos and reports show the split.
    if settings.payments_mode != "mock" and not settings.paystack_platform_subaccount:
        return Decimal(0)
    share = Decimal(amount) * settings.paystack_platform_percent / Decimal(100)
    return share.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def split_params(amount: Decimal) -> dict:
    """Per-transaction split: the main account keeps `transaction_charge`, the subaccount the rest."""
    share = platform_share(amount)
    if share <= 0 or not settings.paystack_platform_subaccount:
        return {}
    return {
        "subaccount": settings.paystack_platform_subaccount,
        "transaction_charge": to_subunits(Decimal(amount) - share),
        "bearer": "account",  # Safiri Nasi pays Paystack's fee; the partner's share arrives in full
    }


def signature_valid(raw_body: bytes, signature: str | None) -> bool:
    """Paystack signs webhooks with HMAC-SHA512 of the raw body using the secret key."""
    if not signature or not settings.paystack_secret_key:
        return False
    expected = hmac.new(settings.paystack_secret_key.encode(), raw_body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature)


class PaystackProvider:
    def __init__(self, method: str, client: httpx.AsyncClient | None = None):
        self.name = method
        self._client = client

    async def _request(self, method: str, path: str, json: dict | None = None) -> tuple[int, dict]:
        if not settings.paystack_secret_key:
            raise ProviderError("Online payments are not configured yet. Please contact us to pay.")
        client = self._client or httpx.AsyncClient(base_url=BASE_URL, timeout=30)
        try:
            resp = await client.request(
                method, path, json=json, headers={"Authorization": f"Bearer {settings.paystack_secret_key}"}
            )
        finally:
            if self._client is None:
                await client.aclose()
        try:
            data = resp.json()
        except ValueError:
            data = {"message": resp.text[:200]}
        return resp.status_code, data

    def _common(self, payment: Payment, booking: Booking) -> dict:
        return {
            "email": booking.contact_email,
            "amount": to_subunits(payment.amount),
            "currency": payment.currency,
            "reference": payment.reference,
            "metadata": {
                "booking_reference": booking.reference,
                "customer": booking.contact_name,
                "tour": booking.tour.title,
            },
            **split_params(payment.amount),
        }

    async def initiate(self, payment: Payment, booking: Booking) -> InitResult:
        payload = self._common(payment, booking)
        if self.name == PaymentMethod.card:
            payload |= {
                "callback_url": f"{settings.frontend_url}/payment/return?payment={payment.reference}",
                "channels": ["card"],
            }
            status, body = await self._request("POST", "/transaction/initialize", payload)
            if status >= 400 or not body.get("status"):
                raise ProviderError(f"Card payment: {body.get('message') or 'could not start payment.'}")
            return InitResult(
                provider_reference=body["data"].get("access_code"),
                message="Redirecting to Paystack's secure card page…",
                redirect_url=body["data"]["authorization_url"],
                raw={"initialize": body.get("data", {})},
            )

        provider = "mpesa" if self.name == PaymentMethod.mpesa else settings.paystack_airtel_provider
        payload["mobile_money"] = {"phone": f"+{payment.phone}", "provider": provider}
        status, body = await self._request("POST", "/charge", payload)
        data = body.get("data") or {}
        if status >= 400 or not body.get("status") or data.get("status") in FAILED:
            reason = data.get("gateway_response") or data.get("message") or body.get("message")
            label = "M-Pesa" if self.name == PaymentMethod.mpesa else "Airtel Money"
            raise ProviderError(f"{label}: {reason or 'request failed.'}")
        label = "M-Pesa" if self.name == PaymentMethod.mpesa else "Airtel Money"
        return InitResult(
            provider_reference=str(data.get("id") or payment.reference),
            message=data.get("display_text") or f"Check your phone and enter your {label} PIN to pay.",
            raw={"charge": data},
        )

    async def query_status(self, payment: Payment) -> StatusResult:
        status, body = await self._request("GET", f"/transaction/verify/{payment.reference}")
        if status == 404:
            return StatusResult("pending", raw=body)
        data = body.get("data") or {}
        state = str(data.get("status") or "").lower()
        if state == "success":
            if (
                to_subunits(payment.amount) != int(data.get("amount") or 0)
                or data.get("currency") != payment.currency
            ):
                return StatusResult(
                    "failed", failure_reason="Paid amount doesn't match. Please contact us.", raw=data
                )
            fees = data.get("fees")
            return StatusResult(
                "success",
                receipt_number=data.get("receipt_number") or f"PSK{data.get('id')}",
                gateway_fee=Decimal(fees) / 100 if fees is not None else None,
                raw=data,
            )
        if state in FAILED:
            return StatusResult(
                "failed",
                failure_reason=data.get("gateway_response") or "The payment didn't go through.",
                raw=data,
            )
        return StatusResult("pending", raw=data)
