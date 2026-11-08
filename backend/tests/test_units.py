"""Pure functions: phone numbers, provider payload parsing and signatures."""

import base64
import hashlib
import hmac
import json
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.config import settings
from app.payments import airtel, dpo, mpesa
from app.payments.phone import InvalidPhone, detect_network, normalize_ke_phone
from app.services.payments import normalize_booking_reference
from app.services.pricing import money, to_kes_for_mobile_money


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("0712345678", "254712345678"),
        ("+254 712 345 678", "254712345678"),
        ("712345678", "254712345678"),
        ("0110123456", "254110123456"),
    ],
)
def test_normalize_phone(raw, expected):
    assert normalize_ke_phone(raw) == expected


@pytest.mark.parametrize("raw", ["", "12345", "0812345678", "+44 7700 900123"])
def test_normalize_phone_rejects_invalid(raw):
    with pytest.raises(InvalidPhone):
        normalize_ke_phone(raw)


@pytest.mark.parametrize(
    ("phone", "network"),
    [
        ("0712345678", "safaricom"),
        ("0796000000", "safaricom"),
        ("0113000000", "safaricom"),
        ("0733123456", "airtel"),
        ("0786000000", "airtel"),
        ("0101000000", "airtel"),
        ("0764000000", "equitel"),
    ],
)
def test_detect_network(phone, network):
    assert detect_network(phone) == network


def test_money_rounding():
    assert money(Decimal("1234.5"), "KES") == Decimal("1235")
    assert money(Decimal("10.005"), "USD") == Decimal("10.01")


def test_usd_converts_up_to_whole_shillings():
    assert to_kes_for_mobile_money(Decimal("100.01"), "USD", Decimal("129")) == Decimal("12902")


def test_booking_reference_from_paybill_account():
    assert normalize_booking_reference("sn7k2m9q") == "SN-7K2M9Q"
    assert normalize_booking_reference(" SN-7K2M9Q ") == "SN-7K2M9Q"
    assert normalize_booking_reference("0712345678") is None
    assert normalize_booking_reference(None) is None


def test_parse_stk_callback():
    body = {
        "Body": {
            "stkCallback": {
                "MerchantRequestID": "m1",
                "CheckoutRequestID": "ws_CO_1",
                "ResultCode": 0,
                "ResultDesc": "Processed",
                "CallbackMetadata": {
                    "Item": [
                        {"Name": "Amount", "Value": 1500},
                        {"Name": "MpesaReceiptNumber", "Value": "QWE123RTY"},
                        {"Name": "PhoneNumber", "Value": 254712345678},
                    ]
                },
            }
        }
    }
    data = mpesa.parse_stk_callback(body)
    assert data == {
        "checkout_request_id": "ws_CO_1",
        "result_code": "0",
        "result_desc": "Processed",
        "receipt": "QWE123RTY",
        "amount": 1500,
        "phone": "254712345678",
    }


def test_dpo_create_token_xml_escapes_customer_input():
    booking = SimpleNamespace(
        contact_name="Ann <script>",
        contact_email="a&b@example.com",
        travel_date=date(2027, 1, 5),
        reference="SN-AAAAAA",
        tour=SimpleNamespace(title="Safari & Beach"),
    )
    payment = SimpleNamespace(amount=Decimal("1500"), currency="KES", reference="PYTEST")
    xml = dpo.build_create_token_xml(payment, booking, "https://x/return", "https://x/back")
    assert "<script>" not in xml and "&lt;script&gt;" in xml
    assert "<PaymentAmount>1500.00</PaymentAmount>" in xml
    assert "Safari &amp; Beach (SN-AAAAAA)" in xml


def test_dpo_parse_response():
    parsed = dpo.parse_response(
        '<?xml version="1.0" encoding="utf-8"?><API3G><Result>000</Result>'
        "<ResultExplanation>Transaction Paid</ResultExplanation><TransactionApproval>123456</TransactionApproval></API3G>"
    )
    assert parsed["Result"] == dpo.PAID
    assert parsed["TransactionApproval"] == "123456"


def test_airtel_callback_signature(monkeypatch):
    monkeypatch.setattr(settings, "airtel_callback_secret", "s3cret")
    txn = {"id": "PY1", "status_code": "TS", "airtel_money_id": "AM1"}
    message = json.dumps(txn, separators=(",", ":")).encode()
    good = base64.b64encode(hmac.new(b"s3cret", message, hashlib.sha256).digest()).decode()
    assert airtel.callback_signature_valid({"transaction": txn, "hash": good})
    assert not airtel.callback_signature_valid({"transaction": txn, "hash": "forged"})
    assert not airtel.callback_signature_valid({"transaction": txn})
