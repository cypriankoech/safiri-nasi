import { differenceInCalendarDays, format, parseISO } from "date-fns";
import type { BookingStatus, Currency, PaymentMethod } from "./types";

export function money(amount: number | null | undefined, currency: Currency | string = "KES") {
  const value = Number(amount ?? 0);
  if (currency === "KES") {
    return `KES ${value.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
  }
  return `${currency === "USD" ? "US$" : currency} ${value.toLocaleString("en-US", {
    minimumFractionDigits: value % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export function compactMoney(amount: number, currency: Currency | string = "KES") {
  const abs = Math.abs(amount);
  const prefix = currency === "KES" ? "KES " : "US$ ";
  if (abs >= 1_000_000) return `${prefix}${(amount / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${prefix}${Math.round(amount / 1000)}K`;
  return money(amount, currency);
}

const asDate = (d: string | Date) => (typeof d === "string" ? parseISO(d) : d);

export const fmtDate = (d: string | Date | null | undefined, pattern = "EEE d MMM yyyy") =>
  d ? format(asDate(d), pattern) : "";

export const fmtShortDate = (d: string | Date | null | undefined) => fmtDate(d, "d MMM yyyy");

export const fmtDateTime = (d: string | Date | null | undefined) => fmtDate(d, "d MMM yyyy, HH:mm");

export function dateRange(start: string, end: string) {
  const s = parseISO(start);
  const e = parseISO(end);
  if (start === end) return format(s, "EEE d MMM yyyy");
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${format(s, "d")}–${format(e, "d MMM yyyy")}`;
  }
  return `${format(s, "d MMM")} – ${format(e, "d MMM yyyy")}`;
}

export function daysUntil(d: string) {
  return differenceInCalendarDays(parseISO(d), new Date());
}

export function duration(days: number, nights: number) {
  if (days <= 1) return "Day trip";
  return `${days} days · ${nights} night${nights === 1 ? "" : "s"}`;
}

export const STATUS_LABELS: Record<BookingStatus, string> = {
  pending_payment: "Awaiting payment",
  confirmed: "Confirmed",
  fully_paid: "Fully paid",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
  refunded: "Refunded",
};

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  mpesa: "M-Pesa",
  airtel: "Airtel Money",
  card: "Card",
  paybill: "M-Pesa Paybill",
  bank: "Bank transfer",
  cash: "Cash",
};

export const DIFFICULTY_LABELS = { easy: "Easy", moderate: "Moderate", challenging: "Challenging" } as const;

export const TOUR_TYPE_LABELS = {
  scheduled: "Group departure",
  private: "Private · any date",
  day_trip: "Day trip",
} as const;

export const REGION_LABELS = { kenya: "Kenya", africa: "Africa", international: "International" } as const;

export const tripCount = (n: number) => `${n} trip${n === 1 ? "" : "s"}`;

export const seatsLeft = (n: number) => `${n} seat${n === 1 ? "" : "s"} left`;
