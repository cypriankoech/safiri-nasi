"""Card payments through DPO Pay (Network International) API v6.

Flow: createToken (XML) -> redirect customer to the hosted payment page -> on return
or push notification, verifyToken. Result 000 means paid; verify within 30 minutes of
payment or DPO emails an alert. Docs: https://directpayonline.atlassian.net/wiki/
"""

from datetime import datetime
from decimal import Decimal
from xml.sax.saxutils import escape

import httpx
from defusedxml import ElementTree

from app.config import settings
from app.models import Booking, Payment
from app.payments.base import InitResult, ProviderError, StatusResult

PAID = "000"
NOT_PAID_YET = "900"
VERIFY_FAILURE_MESSAGES = {
    "901": "Your card was declined.",
    "902": "The payment details didn't match. Please try again.",
    "903": "The payment time limit passed. Please start again.",
    "904": "The card payment was cancelled.",
}


def api_url() -> str:
    if settings.payments_mode == "live":
        return "https://secure.3gdirectpay.com/API/v6/"
    return "https://secure1.sandbox.directpay.online/API/v6/"


def payment_page_url(token: str) -> str:
    host = (
        "https://secure.3gdirectpay.com"
        if settings.payments_mode == "live"
        else "https://secure1.sandbox.directpay.online"
    )
    return f"{host}/payv2.php?ID={token}"


def _xml(tag: str, value: object) -> str:
    return f"<{tag}>{escape(str(value))}</{tag}>"


def build_create_token_xml(payment: Payment, booking: Booking, redirect_url: str, back_url: str) -> str:
    first, _, last = booking.contact_name.partition(" ")
    service_date = datetime.combine(booking.travel_date, datetime.min.time()).strftime("%Y/%m/%d %H:%M")
    return (
        '<?xml version="1.0" encoding="utf-8"?><API3G>'
        + _xml("CompanyToken", settings.dpo_company_token)
        + _xml("Request", "createToken")
        + "<Transaction>"
        + _xml("PaymentAmount", f"{Decimal(payment.amount):.2f}")
        + _xml("PaymentCurrency", payment.currency)
        + _xml("CompanyRef", payment.reference)
        + _xml("RedirectURL", redirect_url)
        + _xml("BackURL", back_url)
        + _xml("CompanyRefUnique", 1)
        + _xml("PTL", settings.dpo_payment_time_limit_hours)
        + _xml("customerEmail", booking.contact_email)
        + _xml("customerFirstName", first)
        + _xml("customerLastName", last or first)
        + "</Transaction><Services><Service>"
        + _xml("ServiceType", settings.dpo_service_type)
        + _xml("ServiceDescription", f"{booking.tour.title} ({booking.reference})"[:200])
        + _xml("ServiceDate", service_date)
        + "</Service></Services></API3G>"
    )


def build_verify_token_xml(token: str) -> str:
    return (
        '<?xml version="1.0" encoding="utf-8"?><API3G>'
        + _xml("CompanyToken", settings.dpo_company_token)
        + _xml("Request", "verifyToken")
        + _xml("TransactionToken", token)
        + "</API3G>"
    )


def parse_response(xml_text: str) -> dict[str, str]:
    root = ElementTree.fromstring(xml_text)
    return {child.tag: (child.text or "").strip() for child in root}


class DpoProvider:
    name = "card"

    def __init__(self, client: httpx.AsyncClient | None = None):
        self._client = client

    async def _post(self, xml_body: str) -> dict[str, str]:
        if not (settings.dpo_company_token and settings.dpo_service_type):
            raise ProviderError("Card payments are not configured yet. Please choose another payment method.")
        client = self._client or httpx.AsyncClient(timeout=30)
        try:
            resp = await client.post(api_url(), content=xml_body, headers={"Content-Type": "application/xml"})
        finally:
            if self._client is None:
                await client.aclose()
        try:
            return parse_response(resp.text)
        except ElementTree.ParseError as exc:
            raise ProviderError("Card payment service returned an unexpected response.") from exc

    async def initiate(self, payment: Payment, booking: Booking) -> InitResult:
        redirect_url = f"{settings.frontend_url}/payment/return?payment={payment.reference}"
        back_url = f"{settings.frontend_url}/booking/{booking.reference}?payment_cancelled=1"
        data = await self._post(build_create_token_xml(payment, booking, redirect_url, back_url))
        if data.get("Result") != PAID:
            raise ProviderError(
                f"Card payment: {data.get('ResultExplanation') or 'could not start payment.'}"
            )
        token = data["TransToken"]
        return InitResult(
            provider_reference=token,
            message="Redirecting to the secure card payment page…",
            redirect_url=payment_page_url(token),
            raw={"create_token": data},
        )

    async def query_status(self, payment: Payment) -> StatusResult:
        data = await self._post(build_verify_token_xml(payment.provider_reference))
        result = data.get("Result")
        if result == PAID:
            # Approval codes are only unique per issuer, so qualify them with our own reference.
            approval = data.get("TransactionApproval") or "DPO"
            return StatusResult("success", receipt_number=f"{approval}-{payment.reference}", raw=data)
        if result == NOT_PAID_YET:
            return StatusResult("pending", raw=data)
        return StatusResult(
            "failed",
            failure_reason=VERIFY_FAILURE_MESSAGES.get(
                result, data.get("ResultExplanation") or "Card payment failed."
            ),
            raw=data,
        )
