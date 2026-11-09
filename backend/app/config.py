from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent

# Safaricom's published sandbox credentials for the 174379 test shortcode.
DARAJA_SANDBOX_SHORTCODE = "174379"
DARAJA_SANDBOX_PASSKEY = "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    app_name: str = "Safiri Nasi API"
    environment: Literal["development", "test", "production"] = "development"
    secret_key: str = "change-me-in-production-please-use-a-long-random-string"
    database_url: str = "postgresql+asyncpg://safiri:safiri@localhost:5434/safiri_nasi"

    # Public URLs. FRONTEND_URL builds links in emails and payment redirects;
    # PUBLIC_API_URL must be reachable by Safaricom/Airtel/DPO for callbacks.
    frontend_url: str = "http://localhost:3000"
    public_api_url: str = "http://localhost:8000"
    cors_origins: list[str] = ["http://localhost:3000"]

    access_token_minutes: int = 60
    refresh_token_days: int = 14
    booking_token_days: int = 60
    cookie_secure: bool = False
    cookie_domain: str | None = None

    # Email
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_tls: bool = False
    smtp_starttls: bool = False
    mail_from: str = "Safiri Nasi <bookings@safirinasitourstravel.co.ke>"
    admin_notify_email: str = "admin@safirinasitourstravel.co.ke"
    send_emails: bool = True

    # Booking behaviour
    hold_minutes: int = 30
    scheduler_enabled: bool = True

    # Payments: "mock" simulates every provider locally, "sandbox" uses provider
    # test environments, "live" uses production endpoints.
    payments_mode: Literal["mock", "sandbox", "live"] = "mock"
    # "paystack": M-Pesa, Airtel Money and cards through Paystack, with revenue splits.
    # "direct": Safaricom Daraja + Airtel Open API + DPO Pay (kept for later use).
    payment_gateway: Literal["paystack", "direct"] = "paystack"
    callback_secret: str = "dev-callback-secret"

    # Paystack (https://dashboard.paystack.com). Test keys (sk_test_…) in sandbox, live keys in live.
    paystack_secret_key: str = ""
    # Revenue split: the platform partner's Paystack subaccount (ACCT_…) and its percentage of
    # every online payment. Paystack's own fee is charged to the main (Safiri Nasi) account.
    # Set on the server, not in the admin panel, so the share can't be changed from the site.
    platform_partner_name: str = "Astralyn"
    paystack_platform_subaccount: str = ""
    paystack_platform_percent: Decimal = Decimal(5)
    paystack_airtel_provider: str = "airtel"  # mobile_money.provider code for Airtel Money (Kenya)

    mpesa_consumer_key: str = ""
    mpesa_consumer_secret: str = ""
    mpesa_shortcode: str = DARAJA_SANDBOX_SHORTCODE
    mpesa_passkey: str = DARAJA_SANDBOX_PASSKEY
    # CustomerPayBillOnline (Paybill) or CustomerBuyGoodsOnline (Till)
    mpesa_transaction_type: str = "CustomerPayBillOnline"
    mpesa_till_number: str = ""
    mpesa_allowed_ips: list[str] = []

    airtel_client_id: str = ""
    airtel_client_secret: str = ""
    airtel_country: str = "KE"
    airtel_currency: str = "KES"
    airtel_collection_path: str = "/merchant/v1/payments/"
    airtel_callback_secret: str = ""

    dpo_company_token: str = ""
    dpo_service_type: str = ""
    dpo_payment_time_limit_hours: int = 2

    upload_dir: Path = BASE_DIR / "uploads"
    max_upload_mb: int = 8

    seed_admin_email: str = "admin@safirinasitourstravel.co.ke"
    seed_admin_password: str = "SafiriAdmin#2026"

    @field_validator("database_url")
    @classmethod
    def use_asyncpg(cls, url: str) -> str:
        """Accept the plain postgres:// URLs that hosts (Render, Neon, Supabase) hand out."""
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                url = "postgresql+asyncpg://" + url[len(prefix) :]
        # asyncpg spells libpq's sslmode=require as ssl=require
        return url.replace("sslmode=", "ssl=")

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
