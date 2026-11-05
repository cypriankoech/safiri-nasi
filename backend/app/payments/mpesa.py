"""Safaricom Daraja integration: M-Pesa Express (STK Push), STK query and C2B Paybill.

Docs: https://developer.safaricom.co.ke — sandbox shortcode 174379 works with any
Safaricom test number. Daraja callbacks are not signed, so callbacks are only trusted
after an STK query confirms the result (see services/payments.handle_mpesa_stk_callback).
"""

import base64
import time
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

import httpx

from app.config import settings
from app.models import Booking, Payment
from app.payments.base import InitResult, ProviderError, StatusResult

NAIROBI = ZoneInfo("Africa/Nairobi")

# STK result codes customers commonly hit, mapped to friendly messages.
RESULT_MESSAGES = {
    "1": "Insufficient M-Pesa balance.",
    "1001": "Another M-Pesa transaction is in progress on this phone. Try again shortly.",
    "1019": "The payment request expired before it was completed.",
    "1025": "M-Pesa couldn't send the prompt. Please try again.",
    "1032": "You cancelled the M-Pesa prompt.",
    "1037": "We couldn't reach your phone. Make sure it's on and try again.",
    "2001": "Wrong M-Pesa PIN entered.",
}
STILL_PROCESSING = "500.001.1001"


def base_url() -> str:
    return (
        "https://api.safaricom.co.ke"
        if settings.payments_mode == "live"
        else "https://sandbox.safaricom.co.ke"
    )


class DarajaClient:
    _token: str | None = None
    _token_expiry: float = 0

    def __init__(self, client: httpx.AsyncClient | None = None):
        self._client = client

    async def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(base_url=base_url(), timeout=30)
        return self._client

    async def access_token(self) -> str:
        if DarajaClient._token and time.time() < DarajaClient._token_expiry - 60:
            return DarajaClient._token
        if not (settings.mpesa_consumer_key and settings.mpesa_consumer_secret):
            raise ProviderError("M-Pesa is not configured yet. Please choose another payment method.")
        http = await self._http()
        resp = await http.get(
            "/oauth/v1/generate",
            params={"grant_type": "client_credentials"},
            auth=(settings.mpesa_consumer_key, settings.mpesa_consumer_secret),
        )
        if resp.status_code != 200:
            raise ProviderError("M-Pesa is temporarily unavailable. Please try again.")
        data = resp.json()
        DarajaClient._token = data["access_token"]
        DarajaClient._token_expiry = time.time() + int(data.get("expires_in", 3599))
        return DarajaClient._token

    @staticmethod
    def password(timestamp: str) -> str:
        raw = f"{settings.mpesa_shortcode}{settings.mpesa_passkey}{timestamp}"
        return base64.b64encode(raw.encode()).decode()

    @staticmethod
    def timestamp() -> str:
        return datetime.now(NAIROBI).strftime("%Y%m%d%H%M%S")

    async def _post(self, path: str, payload: dict) -> dict:
        http = await self._http()
        token = await self.access_token()
        resp = await http.post(path, json=payload, headers={"Authorization": f"Bearer {token}"})
        try:
            data = resp.json()
        except ValueError:
            data = {"raw": resp.text}
        data["_http_status"] = resp.status_code
        return data

    async def stk_push(
        self, *, phone: str, amount: Decimal, account_reference: str, description: str, callback_url: str
    ) -> dict:
        ts = self.timestamp()
        till = settings.mpesa_transaction_type == "CustomerBuyGoodsOnline"
        payload = {
            "BusinessShortCode": settings.mpesa_shortcode,
            "Password": self.password(ts),
            "Timestamp": ts,
            "TransactionType": settings.mpesa_transaction_type,
            "Amount": int(amount),
            "PartyA": phone,
            "PartyB": settings.mpesa_till_number
            if till and settings.mpesa_till_number
            else settings.mpesa_shortcode,
            "PhoneNumber": phone,
            "CallBackURL": callback_url,
            "AccountReference": account_reference[:12],
            "TransactionDesc": description[:13],
        }
        return await self._post("/mpesa/stkpush/v1/processrequest", payload)

    async def stk_query(self, checkout_request_id: str) -> dict:
        ts = self.timestamp()
        payload = {
            "BusinessShortCode": settings.mpesa_shortcode,
            "Password": self.password(ts),
            "Timestamp": ts,
            "CheckoutRequestID": checkout_request_id,
        }
        return await self._post("/mpesa/stkpushquery/v1/query", payload)

    async def register_c2b_urls(self, confirmation_url: str, validation_url: str) -> dict:
        payload = {
            "ShortCode": settings.mpesa_shortcode,
            "ResponseType": "Completed",
            "ConfirmationURL": confirmation_url,
            "ValidationURL": validation_url,
        }
        return await self._post("/mpesa/c2b/v2/registerurl", payload)


def stk_callback_url() -> str:
    return f"{settings.public_api_url}/api/callbacks/mpesa/stk/{settings.callback_secret}"


class MpesaProvider:
    name = "mpesa"

    def __init__(self, client: DarajaClient | None = None):
        self.client = client or DarajaClient()

    async def initiate(self, payment: Payment, booking: Booking) -> InitResult:
        data = await self.client.stk_push(
            phone=payment.phone,
            amount=payment.amount,
            account_reference=booking.reference,
            description=f"Trip {booking.reference}",
            callback_url=stk_callback_url(),
        )
        if str(data.get("ResponseCode")) != "0":
            message = data.get("errorMessage") or data.get("ResponseDescription") or "M-Pesa request failed."
            raise ProviderError(f"M-Pesa: {message}")
        return InitResult(
            provider_reference=data["CheckoutRequestID"],
            message=data.get("CustomerMessage") or "Check your phone and enter your M-Pesa PIN.",
            raw={"stk_request": data},
        )

    async def query_status(self, payment: Payment) -> StatusResult:
        data = await self.client.stk_query(payment.provider_reference)
        if data.get("errorCode") == STILL_PROCESSING:
            return StatusResult("pending", raw=data)
        code = data.get("ResultCode")
        if code is None:
            return StatusResult("pending", raw=data)
        code = str(code)
        if code == "0":
            # STK query doesn't return the receipt; the callback carries it.
            return StatusResult("success", raw=data)
        return StatusResult(
            "failed",
            failure_reason=RESULT_MESSAGES.get(code, data.get("ResultDesc") or "M-Pesa payment failed."),
            raw=data,
        )


def parse_stk_callback(body: dict) -> dict:
    """Flatten Daraja's STK callback into {checkout_request_id, result_code, receipt, amount, phone, desc}."""
    cb = (body.get("Body") or {}).get("stkCallback") or {}
    items = {i.get("Name"): i.get("Value") for i in (cb.get("CallbackMetadata") or {}).get("Item", [])}
    return {
        "checkout_request_id": cb.get("CheckoutRequestID"),
        "result_code": str(cb.get("ResultCode")),
        "result_desc": cb.get("ResultDesc"),
        "receipt": items.get("MpesaReceiptNumber"),
        "amount": items.get("Amount"),
        "phone": str(items.get("PhoneNumber")) if items.get("PhoneNumber") else None,
    }
