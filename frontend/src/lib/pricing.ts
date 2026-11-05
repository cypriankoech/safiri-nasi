import type { Currency, Departure, RateCategory, TourPrice } from "./types";

/** Per-person adult price for display; the API's /quote endpoint is the source of truth at checkout. */
export function adultPrice(
  prices: TourPrice[],
  rate: RateCategory,
  currency: Currency,
  usdToKes: number,
  departure?: Departure | null,
): number | null {
  let price = prices.find((p) => p.rate_category === rate && p.currency === currency);
  let amount: number | null = price ? price.adult_price : null;
  if (!price) {
    price = prices.find((p) => p.rate_category === rate);
    if (price) {
      amount = currency === "KES" ? price.adult_price * usdToKes : price.adult_price / usdToKes;
    }
  }
  if (amount === null) return null;
  const adjusted = amount * (1 + (departure?.price_adjustment_percent ?? 0) / 100);
  return currency === "KES" ? Math.round(adjusted) : Math.round(adjusted * 100) / 100;
}

export function hasRate(prices: TourPrice[], rate: RateCategory) {
  return prices.some((p) => p.rate_category === rate);
}
