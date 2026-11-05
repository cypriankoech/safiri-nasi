"""Airtel Money Kenya via the Airtel Africa Open API (collections / USSD push).

Docs: https://developers.airtel.africa — UAT at openapiuat.airtel.africa. The collection
path is configurable (AIRTEL_COLLECTION_PATH) because Airtel assigns v1 or the signed v2
endpoint per merchant during onboarding. Callbacks are always confirmed with a status
query before money is credited, so an unsigned or spoofed callback can't mark a payment paid.
"""

import base64
import hashlib
import hmac
import json
import time

import httpx

from app.config import settings
from app.models import Booking, Payment
from app.payments.base import InitResult, ProviderError, StatusResult

STATUS_SUCCESS = "TS"
STATUS_FAILED = "TF"
PENDING_STATUSES = {"TIP", "TA", "TP"}  # in progress / ambiguous / pending


def base_url() -> str:
    return (
        "https://openapi.airtel.africa"
        if settings.payments_mode == "live"
        else "https://openapiuat.airtel.africa"
    )


class AirtelClient:
    _token: str | None = None
    _token_expiry: float = 0

    def __init__(self, client: httpx.AsyncClient | None = None):
        self._client = client

    async def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(base_url=base_url(), timeout=30)
        return self._client

    async def access_token(self) -> str:
        if AirtelClient._token and time.time() < AirtelClient._token_expiry - 60:
            return AirtelClient._token
        if not (settings.airtel_client_id and settings.airtel_client_secret):
            raise ProviderError("Airtel Money is not configured yet. Please choose another payment method.")
        http = await self._http()
        resp = await http.post(
            "/auth/oauth2/token",
            json={
                "client_id": settings.airtel_client_id,
                "client_secret": settings.airtel_client_secret,
                "grant_type": "client_credentials",
            },
        )
        if resp.status_code != 200:
            raise ProviderError("Airtel Money is temporarily unavailable. Please try again.")
        data = resp.json()
        AirtelClient._token = data["access_token"]
        AirtelClient._token_expiry = time.time() + int(data.get("expires_in", 180))
        return AirtelClient._token

    async def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {await self.access_token()}",
            "X-Country": settings.airtel_country,
            "X-Currency": settings.airtel_currency,
            "Accept": "*/*",
        }

    async def collect(self, *, msisdn: str, amount: int, transaction_id: str, reference: str) -> dict:
        http = await self._http()
        payload = {
            "reference": reference,
            "subscriber": {
                "country": settings.airtel_country,
                "currency": settings.airtel_currency,
                "msisdn": msisdn,
            },
            "transaction": {
                "amount": amount,
                "country": settings.airtel_country,
                "currency": settings.airtel_currency,
                "id": transaction_id,
            },
        }
        resp = await http.post(settings.airtel_collection_path, json=payload, headers=await self._headers())
        try:
            data = resp.json()
        except ValueError:
            data = {"raw": resp.text}
        data["_http_status"] = resp.status_code
        return data

    async def status(self, transaction_id: str) -> dict:
        http = await self._http()
        resp = await http.get(f"/standard/v1/payments/{transaction_id}", headers=await self._headers())
        try:
            return resp.json()
        except ValueError:
            return {"raw": resp.text, "_http_status": resp.status_code}


class AirtelProvider:
    name = "airtel"

    def __init__(self, client: AirtelClient | None = None):
        self.client = client or AirtelClient()

    async def initiate(self, payment: Payment, booking: Booking) -> InitResult:
        # Airtel Kenya expects the subscriber number without the 254 country code.
        msisdn = payment.phone[3:] if payment.phone.startswith("254") else payment.phone
        data = await self.client.collect(
            msisdn=msisdn,
            amount=int(payment.amount),
            transaction_id=payment.reference,
            reference=booking.reference,
        )
        status = data.get("status") or {}
        if not status.get("success"):
            raise ProviderError(f"Airtel Money: {status.get('message') or 'request failed.'}")
        return InitResult(
            provider_reference=payment.reference,
            message="Check your phone and enter your Airtel Money PIN to pay.",
            raw={"collect_request": data},
        )

    async def query_status(self, payment: Payment) -> StatusResult:
        data = await self.client.status(payment.reference)
        txn = (data.get("data") or {}).get("transaction") or {}
        code = txn.get("status")
        if code == STATUS_SUCCESS:
            return StatusResult("success", receipt_number=txn.get("airtel_money_id"), raw=data)
        if code == STATUS_FAILED:
            return StatusResult(
                "failed", failure_reason=txn.get("message") or "Airtel Money payment failed.", raw=data
            )
        return StatusResult("pending", raw=data)


def callback_signature_valid(body: dict) -> bool:
    """When callback authentication is enabled, Airtel sends hash = base64(HMAC-SHA256(transaction JSON))."""
    if not settings.airtel_callback_secret:
        return True
    received = body.get("hash")
    if not received:
        return False
    message = json.dumps(body.get("transaction", {}), separators=(",", ":")).encode()
    expected = base64.b64encode(
        hmac.new(settings.airtel_callback_secret.encode(), message, hashlib.sha256).digest()
    ).decode()
    return hmac.compare_digest(expected, received)
