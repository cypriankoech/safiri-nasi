"use client";

import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { CalendarCheck, Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePrefs } from "@/components/providers";
import { WhatsAppIcon } from "@/components/site/whatsapp-button";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select, Stepper } from "@/components/ui/field";
import { api } from "@/lib/api";
import { dateRange, money } from "@/lib/format";
import { adultPrice, hasRate } from "@/lib/pricing";
import type { Quote, RateCategory, TourDetail } from "@/lib/types";
import { useClientValue } from "@/lib/use-client-value";
import { cn, whatsappLink } from "@/lib/utils";

let tomorrow: string | undefined;
const getTomorrow = () => (tomorrow ??= format(addDays(new Date(), 1), "yyyy-MM-dd"));

export function BookingWidget({ tour, usdToKes, whatsapp }: { tour: TourDetail; usdToKes: number; whatsapp: string }) {
  const router = useRouter();
  const { currency, rate, setPrefs } = usePrefs();
  const bookable = tour.departures.filter((d) => d.is_bookable);
  const scheduled = tour.tour_type === "scheduled";
  const [departureId, setDepartureId] = useState<number | null>(bookable[0]?.id ?? null);
  const [date, setDate] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const minDate = useClientValue(getTomorrow, "");

  const effectiveRate: RateCategory = hasRate(tour.prices, rate) ? rate : tour.prices[0]?.rate_category ?? "resident";
  const departure = bookable.find((d) => d.id === departureId) ?? null;
  const maxPax = Math.min(tour.max_group, departure?.seats_left ?? tour.max_group);
  const ready = scheduled ? !!departure : !!date;
  const perPerson = adultPrice(tour.prices, effectiveRate, currency, usdToKes, departure);

  const quote = useQuery({
    queryKey: ["quote", tour.slug, departureId, date, adults, children, effectiveRate, currency],
    enabled: ready,
    queryFn: () =>
      api<Quote>("/api/quote", {
        body: {
          tour_slug: tour.slug,
          departure_id: scheduled ? departureId : null,
          travel_date: scheduled ? null : date,
          adults,
          children,
          rate_category: effectiveRate,
          currency,
        },
      }),
    retry: false,
  });

  const book = () => {
    const q = new URLSearchParams({
      adults: String(adults),
      children: String(children),
      rate: effectiveRate,
      currency,
    });
    if (scheduled && departureId) q.set("departure", String(departureId));
    if (!scheduled && date) q.set("date", date);
    router.push(`/book/${tour.slug}?${q}`);
  };

  return (
    <div className="rounded-3xl border border-border bg-surface p-5 shadow-soft">
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-xs text-muted">From</p>
          <p className="font-display text-3xl font-extrabold text-primary">
            {perPerson !== null ? money(perPerson, currency) : "On request"}
          </p>
          <p className="text-xs text-muted">per person sharing</p>
        </div>
        <div className="flex rounded-full border border-border p-0.5 text-xs font-bold" role="group" aria-label="Currency">
          {(["KES", "USD"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setPrefs({ currency: c })}
              className={cn("rounded-full px-2.5 py-1", currency === c ? "bg-forest text-white dark:bg-lime dark:text-forest-deep" : "text-muted")}
              aria-pressed={currency === c}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1 text-sm font-semibold" role="radiogroup" aria-label="Rate">
        {(["resident", "non_resident"] as const).map((r) => (
          <button
            key={r}
            role="radio"
            aria-checked={effectiveRate === r}
            disabled={!hasRate(tour.prices, r)}
            onClick={() => setPrefs({ rate: r })}
            className={cn(
              "rounded-xl px-2 py-2 transition disabled:opacity-40",
              effectiveRate === r ? "bg-surface shadow-sm" : "text-muted",
            )}
          >
            {r === "resident" ? "EA resident" : "Non-resident"}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        {scheduled ? (
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">Departure date</span>
            {bookable.length ? (
              <Select value={departureId ?? ""} onChange={(e) => setDepartureId(Number(e.target.value))}>
                {bookable.map((d) => (
                  <option key={d.id} value={d.id}>
                    {dateRange(d.start_date, d.end_date)} · {d.seats_left} seats left
                  </option>
                ))}
              </Select>
            ) : (
              <p className="rounded-xl bg-warning-bg p-3 text-sm text-warning">
                No open departures right now. Message us and we&apos;ll add a date.
              </p>
            )}
          </label>
        ) : (
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">Start date</span>
            <Input type="date" min={minDate} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        )}
        <div className="flex items-center justify-between">
          <span>
            <span className="block text-sm font-semibold">Adults</span>
            <span className="text-xs text-muted">12+ years</span>
          </span>
          <Stepper label="adults" value={adults} min={1} max={Math.max(1, maxPax - children)} onChange={setAdults} />
        </div>
        <div className="flex items-center justify-between">
          <span>
            <span className="block text-sm font-semibold">Children</span>
            <span className="text-xs text-muted">2–11 years</span>
          </span>
          <Stepper label="children" value={children} min={0} max={Math.max(0, maxPax - adults)} onChange={setChildren} />
        </div>
      </div>

      {ready && (
        <div className="mt-5 rounded-2xl bg-surface-2 p-4 text-sm" aria-live="polite">
          {quote.isLoading ? (
            <p className="flex items-center gap-2 text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Calculating…
            </p>
          ) : quote.error ? (
            <p className="text-danger">{(quote.error as Error).message}</p>
          ) : quote.data ? (
            <>
              {quote.data.line_items.map((li) => (
                <div key={li.label} className="flex justify-between py-0.5 text-muted">
                  <span>
                    {li.label} × {li.quantity}
                  </span>
                  <span>{money(li.amount, quote.data.currency)}</span>
                </div>
              ))}
              <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-bold">
                <span>Total</span>
                <span>{money(quote.data.total, quote.data.currency)}</span>
              </div>
              <div className="mt-1 flex justify-between font-semibold text-lime-strong dark:text-lime">
                <span>{quote.data.payment_plan === "full" ? "Pay in full today" : `Deposit today (${quote.data.deposit_percent}%)`}</span>
                <span>{money(quote.data.deposit_amount, quote.data.currency)}</span>
              </div>
            </>
          ) : null}
        </div>
      )}

      <Button className="mt-5 w-full" size="lg" disabled={!ready || !!quote.error} onClick={book}>
        <CalendarCheck className="h-5 w-5" /> Book now
      </Button>
      <ButtonLink
        href={whatsappLink(whatsapp, `Hi Safiri Nasi! I have a question about "${tour.title}".`)}
        variant="outline"
        className="mt-2 w-full"
      >
        <WhatsAppIcon className="h-5 w-5 text-[#25d366]" /> Ask on WhatsApp
      </ButtonLink>
      <ul className="mt-4 space-y-1.5 text-xs text-muted">
        <li className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-lime-strong" /> Pay a {tour.deposit_percent}% deposit by M-Pesa, Airtel Money or card
        </li>
        <li className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-lime-strong" /> Seats held for 30 minutes while you pay
        </li>
      </ul>
    </div>
  );
}
