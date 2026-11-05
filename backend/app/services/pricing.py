from dataclasses import asdict, dataclass, field
from datetime import date, timedelta
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Departure, PromoCode, Tour
from app.models.enums import Currency, DiscountType, PaymentPlan, RateCategory, TourType
from app.services import site_settings


class QuoteError(ValueError):
    pass


def money(amount: Decimal, currency: str) -> Decimal:
    """Round to the precision customers actually pay in: whole shillings, US cents."""
    step = Decimal("1") if currency == Currency.KES else Decimal("0.01")
    return Decimal(amount).quantize(step, rounding=ROUND_HALF_UP)


def convert(amount: Decimal, from_currency: str, to_currency: str, usd_to_kes: Decimal) -> Decimal:
    if from_currency == to_currency:
        return Decimal(amount)
    if from_currency == Currency.USD and to_currency == Currency.KES:
        return Decimal(amount) * usd_to_kes
    if from_currency == Currency.KES and to_currency == Currency.USD:
        return Decimal(amount) / usd_to_kes
    raise QuoteError(f"Unsupported currency pair {from_currency}->{to_currency}")


def to_kes_for_mobile_money(amount: Decimal, currency: str, usd_to_kes: Decimal) -> Decimal:
    """Mobile money only moves whole shillings; round up so a converted payment never falls short."""
    kes = convert(amount, currency, Currency.KES, usd_to_kes)
    return kes.quantize(Decimal("1"), rounding=ROUND_CEILING)


@dataclass
class UnitPrices:
    adult: Decimal
    child: Decimal
    single_supplement: Decimal | None
    compare_at: Decimal | None
    converted: bool


def unit_prices(tour: Tour, rate_category: str, currency: str, usd_to_kes: Decimal) -> UnitPrices | None:
    """Price for the requested rate/currency, converting from the other currency if only that is set."""
    by_key = {(p.rate_category, p.currency): p for p in tour.prices}
    price = by_key.get((rate_category, currency))
    converted = False
    if price is None:
        other = Currency.USD if currency == Currency.KES else Currency.KES
        price = by_key.get((rate_category, other))
        converted = price is not None
    if price is None:
        return None

    def conv(value: Decimal | None) -> Decimal | None:
        if value is None:
            return None
        return money(convert(value, price.currency, currency, usd_to_kes), currency)

    adult = conv(price.adult_price)
    return UnitPrices(
        adult=adult,
        child=conv(price.child_price) if price.child_price is not None else adult,
        single_supplement=conv(price.single_supplement),
        compare_at=conv(price.compare_at_price),
        converted=converted,
    )


def from_price(tour: Tour, rate_category: str, currency: str, usd_to_kes: Decimal) -> dict | None:
    prices = unit_prices(tour, rate_category, currency, usd_to_kes)
    if prices is None:
        # Fall back to whichever rate category the tour does have.
        for alt in RateCategory:
            prices = unit_prices(tour, alt, currency, usd_to_kes)
            if prices:
                rate_category = alt
                break
    if prices is None:
        return None
    return {
        "amount": prices.adult,
        "compare_at": prices.compare_at,
        "currency": currency,
        "rate_category": rate_category,
    }


@dataclass
class Quote:
    tour_id: int
    departure_id: int | None
    travel_date: date
    end_date: date
    rate_category: str
    currency: str
    adults: int
    children: int
    line_items: list[dict] = field(default_factory=list)
    add_ons: list[dict] = field(default_factory=list)
    subtotal: Decimal = Decimal(0)
    discount: Decimal = Decimal(0)
    promo_code: str | None = None
    promo_message: str | None = None
    total: Decimal = Decimal(0)
    deposit_percent: int = 30
    deposit_amount: Decimal = Decimal(0)
    payment_plan: str = PaymentPlan.deposit
    full_payment_required: bool = False
    balance_due_date: date | None = None

    def as_dict(self) -> dict:
        return asdict(self)


async def find_promo(db: AsyncSession, code: str) -> PromoCode | None:
    return await db.scalar(select(PromoCode).where(func.upper(PromoCode.code) == code.strip().upper()))


def _promo_discount(
    promo: PromoCode | None, tour: Tour, subtotal: Decimal, currency: str, usd_to_kes: Decimal
) -> tuple[Decimal, str]:
    today = date.today()
    if promo is None or not promo.active:
        return Decimal(0), "That promo code isn't valid."
    if promo.valid_from and today < promo.valid_from:
        return Decimal(0), "That promo code isn't active yet."
    if promo.valid_to and today > promo.valid_to:
        return Decimal(0), "That promo code has expired."
    if promo.max_uses is not None and promo.used_count >= promo.max_uses:
        return Decimal(0), "That promo code has been fully redeemed."
    if promo.tour_id and promo.tour_id != tour.id:
        return Decimal(0), "That promo code doesn't apply to this tour."
    if promo.min_total:
        minimum = convert(promo.min_total, promo.currency or currency, currency, usd_to_kes)
        if subtotal < minimum:
            return Decimal(0), f"Spend at least {currency} {money(minimum, currency):,} to use this code."
    if promo.discount_type == DiscountType.percent:
        discount = subtotal * promo.value / Decimal(100)
    else:
        discount = convert(promo.value, promo.currency or currency, currency, usd_to_kes)
    discount = min(money(discount, currency), subtotal)
    return discount, f"Promo applied: {promo.description or promo.code}"


async def build_quote(
    db: AsyncSession,
    tour: Tour,
    *,
    rate_category: str,
    currency: str,
    adults: int,
    children: int = 0,
    departure: Departure | None = None,
    travel_date: date | None = None,
    add_on_ids: list[int] | None = None,
    promo_code: str | None = None,
    payment_plan: str = PaymentPlan.deposit,
) -> Quote:
    if adults < 1:
        raise QuoteError("At least one adult must travel.")
    if children < 0:
        raise QuoteError("Children can't be negative.")
    pax = adults + children
    if pax > tour.max_group:
        raise QuoteError(f"This tour takes up to {tour.max_group} travellers per booking.")

    today = date.today()
    if tour.tour_type == TourType.scheduled:
        if departure is None:
            raise QuoteError("Please choose a departure date.")
        if departure.tour_id != tour.id:
            raise QuoteError("That departure doesn't belong to this tour.")
        if not departure.is_bookable:
            raise QuoteError("That departure is no longer available.")
        if departure.seats_left < pax:
            raise QuoteError(f"Only {departure.seats_left} seats left on that departure.")
        start, end = departure.start_date, departure.end_date
    else:
        if departure is not None and departure.tour_id == tour.id and departure.is_bookable:
            start, end = departure.start_date, departure.end_date
        else:
            departure = None
            if travel_date is None:
                raise QuoteError("Please choose a travel date.")
            if travel_date <= today:
                raise QuoteError("Travel date must be in the future.")
            start = travel_date
            end = travel_date + timedelta(days=max(tour.duration_days - 1, 0))
    if tour.valid_to and start > tour.valid_to:
        raise QuoteError("This offer isn't available for that date.")

    fx = await site_settings.usd_to_kes(db)
    prices = unit_prices(tour, rate_category, currency, fx)
    if prices is None:
        raise QuoteError("This tour has no price for the selected rate.")

    adjust = Decimal(1) + (departure.price_adjustment_percent if departure else Decimal(0)) / Decimal(100)
    adult_unit = money(prices.adult * adjust, currency)
    child_unit = money(prices.child * adjust, currency)

    quote = Quote(
        tour_id=tour.id,
        departure_id=departure.id if departure else None,
        travel_date=start,
        end_date=end,
        rate_category=rate_category,
        currency=currency,
        adults=adults,
        children=children,
        deposit_percent=tour.deposit_percent,
    )
    rate_label = "Resident" if rate_category == RateCategory.resident else "Non-resident"
    quote.line_items.append(
        {
            "label": f"Adult ({rate_label})",
            "quantity": adults,
            "unit_price": adult_unit,
            "amount": adult_unit * adults,
        }
    )
    if children:
        quote.line_items.append(
            {
                "label": f"Child ({rate_label})",
                "quantity": children,
                "unit_price": child_unit,
                "amount": child_unit * children,
            }
        )
    if pax == 1 and prices.single_supplement:
        supplement = money(prices.single_supplement * adjust, currency)
        quote.line_items.append(
            {"label": "Single supplement", "quantity": 1, "unit_price": supplement, "amount": supplement}
        )

    wanted = set(add_on_ids or [])
    for add_on in tour.add_ons:
        if add_on.id not in wanted or not add_on.active:
            continue
        unit = add_on.price_kes if currency == Currency.KES else add_on.price_usd
        if not unit:
            other = add_on.price_usd if currency == Currency.KES else add_on.price_kes
            other_currency = Currency.USD if currency == Currency.KES else Currency.KES
            unit = money(convert(other, other_currency, currency, fx), currency)
        qty = pax if add_on.per_person else 1
        item = {"label": add_on.name, "quantity": qty, "unit_price": unit, "amount": unit * qty}
        quote.line_items.append(item)
        quote.add_ons.append({"id": add_on.id, **item})

    quote.subtotal = money(sum((i["amount"] for i in quote.line_items), Decimal(0)), currency)

    if promo_code:
        promo = await find_promo(db, promo_code)
        quote.discount, quote.promo_message = _promo_discount(promo, tour, quote.subtotal, currency, fx)
        if quote.discount > 0:
            quote.promo_code = promo.code

    quote.total = money(quote.subtotal - quote.discount, currency)
    quote.balance_due_date = start - timedelta(days=tour.balance_due_days)
    quote.full_payment_required = quote.balance_due_date <= today or tour.deposit_percent >= 100
    if quote.full_payment_required or payment_plan == PaymentPlan.full:
        quote.payment_plan = PaymentPlan.full
        quote.deposit_amount = quote.total
    else:
        quote.payment_plan = PaymentPlan.deposit
        quote.deposit_amount = money(quote.total * Decimal(tour.deposit_percent) / Decimal(100), currency)
    return quote
