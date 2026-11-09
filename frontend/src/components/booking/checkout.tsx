"use client";

import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Lock, Tag, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { usePrefs, useSession } from "@/components/providers";
import { PaymentLogos } from "@/components/site/payment-logos";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Stepper, Textarea } from "@/components/ui/field";
import { api, bookingTokens } from "@/lib/api";
import { dateRange, duration, fmtDate, money, seatsLeft } from "@/lib/format";
import { hasRate } from "@/lib/pricing";
import type { Booking, Currency, Quote, RateCategory, TourDetail } from "@/lib/types";
import { useClientValue } from "@/lib/use-client-value";
import { cn } from "@/lib/utils";

type Initial = {
  departure?: number;
  date?: string;
  adults?: number;
  children?: number;
  rate?: RateCategory;
  currency?: Currency;
};

type TravellerForm = { full_name: string; nationality: string; passport_number: string; dietary: string };

const COUNTRIES = ["Kenya", "Uganda", "Tanzania", "Rwanda", "Burundi", "South Sudan", "Ethiopia", "Somalia", "DR Congo", "Nigeria", "South Africa", "United Kingdom", "United States", "Germany", "France", "Italy", "Netherlands", "Spain", "India", "China", "Japan", "Australia", "Canada", "United Arab Emirates", "Other"];

let tomorrow: string | undefined;
const getTomorrow = () => (tomorrow ??= format(addDays(new Date(), 1), "yyyy-MM-dd"));

export function Checkout({ tour, initial }: { tour: TourDetail; initial: Initial }) {
  const router = useRouter();
  const prefs = usePrefs();
  const { user } = useSession();
  const scheduled = tour.tour_type === "scheduled";
  const bookable = tour.departures.filter((d) => d.is_bookable);
  const minDate = useClientValue(getTomorrow, "");

  const [step, setStep] = useState<1 | 2>(1);
  const [departureId, setDepartureId] = useState<number | null>(
    initial.departure && bookable.some((d) => d.id === initial.departure) ? initial.departure : (bookable[0]?.id ?? null),
  );
  const [date, setDate] = useState(initial.date ?? "");
  const [adults, setAdults] = useState(Math.max(1, initial.adults ?? 2));
  const [children, setChildren] = useState(Math.max(0, initial.children ?? 0));
  const [rate, setRate] = useState<RateCategory>(() => {
    const wanted = initial.rate ?? prefs.rate;
    return hasRate(tour.prices, wanted) ? wanted : tour.prices[0]?.rate_category ?? "resident";
  });
  const [currency, setCurrency] = useState<Currency>(initial.currency ?? prefs.currency);
  const [addOns, setAddOns] = useState<number[]>([]);
  const [plan, setPlan] = useState<"deposit" | "full">("deposit");
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<string | null>(null);

  const [contact, setContact] = useState({ name: "", email: "", phone: "", country: "Kenya" });
  const [travellers, setTravellers] = useState<TravellerForm[]>([]);
  const [requests, setRequests] = useState("");
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  if (user && !prefilled) {
    setPrefilled(true);
    setContact((c) => ({
      name: c.name || user.full_name,
      email: c.email || user.email,
      phone: c.phone || user.phone || "",
      country: user.country || c.country,
    }));
  }

  const pax = adults + children;
  if (travellers.length !== pax) {
    setTravellers(
      Array.from({ length: pax }, (_, i) => travellers[i] ?? { full_name: "", nationality: "", passport_number: "", dietary: "" }),
    );
  }

  const departure = bookable.find((d) => d.id === departureId) ?? null;
  const maxPax = Math.min(tour.max_group, departure?.seats_left ?? tour.max_group);
  const ready = scheduled ? !!departure : !!date;

  const quoteBody = {
    tour_slug: tour.slug,
    departure_id: scheduled ? departureId : null,
    travel_date: scheduled ? null : date || null,
    adults,
    children,
    rate_category: rate,
    currency,
    add_on_ids: addOns,
    promo_code: promo,
    payment_plan: plan,
  };
  const quote = useQuery({
    queryKey: ["checkout-quote", quoteBody],
    queryFn: () => api<Quote>("/api/quote", { body: quoteBody }),
    enabled: ready,
    retry: false,
  });
  const q = quote.data;

  const validateDetails = () => {
    const e: Record<string, string> = {};
    if (contact.name.trim().length < 2) e.name = "Enter your full name";
    if (!/^\S+@\S+\.\S+$/.test(contact.email)) e.email = "Enter a valid email";
    if (contact.phone.replace(/\D/g, "").length < 9) e.phone = "Enter a valid phone number";
    travellers.forEach((t, i) => {
      if (i > 0 && t.full_name.trim().length < 2) e[`t${i}`] = "Enter the traveller's name";
    });
    if (!terms) e.terms = "Please accept the booking terms";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validateDetails()) {
      toast.error("Please check the highlighted fields.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api<{ booking: Booking; access_token: string }>("/api/bookings", {
        body: {
          ...quoteBody,
          contact,
          travellers: travellers.map((t, i) => ({
            full_name: i === 0 && !t.full_name.trim() ? contact.name : t.full_name,
            traveller_type: i < adults ? "adult" : "child",
            nationality: t.nationality || null,
            passport_number: t.passport_number || null,
            dietary: t.dietary || null,
          })),
          special_requests: requests || null,
          accept_terms: terms,
        },
      });
      bookingTokens.set(res.booking.reference, res.access_token);
      router.push(`/booking/${res.booking.reference}?new=1`);
    } catch (err) {
      toast.error((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
      <div className="min-w-0">
        <ol className="mb-6 flex items-center gap-3 text-sm font-semibold" aria-label="Checkout steps">
          {["Your trip", "Traveller details", "Payment"].map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-full text-xs",
                  i + 1 < step ? "bg-lime text-forest-deep" : i + 1 === step ? "bg-forest text-white dark:bg-lime dark:text-forest-deep" : "bg-surface-3 text-muted",
                )}
              >
                {i + 1 < step ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={cn("hidden sm:inline", i + 1 !== step && "text-muted")}>{label}</span>
              {i < 2 && <span className="h-px w-6 bg-border" />}
            </li>
          ))}
        </ol>

        {step === 1 ? (
          <div className="space-y-6">
            <section className="rounded-3xl border border-border bg-surface p-6">
              <h2 className="flex items-center gap-2 text-xl font-bold">
                <CalendarDays className="h-5 w-5 text-lime-strong" /> When are you travelling?
              </h2>
              {scheduled ? (
                bookable.length ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {bookable.slice(0, 12).map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setDepartureId(d.id)}
                        className={cn(
                          "rounded-2xl border p-3 text-left transition",
                          departureId === d.id ? "border-lime bg-lime/10 ring-2 ring-lime" : "border-border hover:border-lime",
                        )}
                        aria-pressed={departureId === d.id}
                      >
                        <span className="block font-semibold">{dateRange(d.start_date, d.end_date)}</span>
                        <span className={cn("text-xs", d.seats_left <= 4 ? "font-bold text-maroon" : "text-muted")}>
                          {seatsLeft(d.seats_left)}{d.status === "guaranteed" ? " · Guaranteed" : ""}
                          {d.price_adjustment_percent > 0 ? " · Peak season" : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-muted">No open departures. Please contact us to request a date.</p>
                )
              ) : (
                <Field label="Start date" className="mt-4 max-w-xs">
                  <Input type="date" min={minDate} value={date} onChange={(e) => setDate(e.target.value)} required />
                </Field>
              )}
            </section>

            <section className="rounded-3xl border border-border bg-surface p-6">
              <h2 className="flex items-center gap-2 text-xl font-bold">
                <Users className="h-5 w-5 text-lime-strong" /> Who&apos;s coming?
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-2xl bg-surface-2 p-4">
                  <span>
                    <b className="block">Adults</b>
                    <span className="text-xs text-muted">12 years and over</span>
                  </span>
                  <Stepper label="adults" value={adults} min={1} max={Math.max(1, maxPax - children)} onChange={setAdults} />
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-surface-2 p-4">
                  <span>
                    <b className="block">Children</b>
                    <span className="text-xs text-muted">2–11 years</span>
                  </span>
                  <Stepper label="children" value={children} min={0} max={Math.max(0, maxPax - adults)} onChange={setChildren} />
                </div>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Rate" hint="Residents must show an East African ID or residence permit at park gates.">
                  <Select value={rate} onChange={(e) => setRate(e.target.value as RateCategory)}>
                    {hasRate(tour.prices, "resident") && <option value="resident">East African citizen / resident</option>}
                    {hasRate(tour.prices, "non_resident") && <option value="non_resident">Non-resident</option>}
                  </Select>
                </Field>
                <Field label="Pay in">
                  <Select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
                    <option value="KES">Kenya shillings (KES)</option>
                    <option value="USD">US dollars (USD)</option>
                  </Select>
                </Field>
              </div>
            </section>

            {tour.add_ons.length > 0 && (
              <section className="rounded-3xl border border-border bg-surface p-6">
                <h2 className="text-xl font-bold">Make it extra special</h2>
                <div className="mt-4 space-y-2">
                  {tour.add_ons.map((a) => {
                    const checked = addOns.includes(a.id);
                    const price = currency === "KES" ? a.price_kes : a.price_usd;
                    return (
                      <label
                        key={a.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition",
                          checked ? "border-lime bg-lime/10" : "border-border hover:border-lime",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setAddOns(checked ? addOns.filter((x) => x !== a.id) : [...addOns, a.id])}
                          className="h-5 w-5 accent-[var(--lime-strong)]"
                        />
                        <span className="flex-1">
                          <b className="block">{a.name}</b>
                          {a.description && <span className="text-sm text-muted">{a.description}</span>}
                        </span>
                        <span className="text-right text-sm font-bold">
                          {money(price, currency)}
                          <span className="block text-xs font-normal text-muted">{a.per_person ? "per person" : "per booking"}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="rounded-3xl border border-border bg-surface p-6">
              <h2 className="text-xl font-bold">How would you like to pay?</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(["deposit", "full"] as const).map((p) => {
                  const disabled = p === "deposit" && q?.full_payment_required;
                  return (
                    <button
                      key={p}
                      type="button"
                      disabled={disabled}
                      onClick={() => setPlan(p)}
                      className={cn(
                        "rounded-2xl border p-4 text-left transition disabled:opacity-50",
                        (q?.payment_plan ?? plan) === p ? "border-lime bg-lime/10 ring-2 ring-lime" : "border-border hover:border-lime",
                      )}
                      aria-pressed={(q?.payment_plan ?? plan) === p}
                    >
                      <b className="block">{p === "deposit" ? `Pay a ${tour.deposit_percent}% deposit` : "Pay in full"}</b>
                      <span className="text-sm text-muted">
                        {p === "deposit"
                          ? disabled
                            ? "Full payment is needed this close to departure."
                            : `Balance due by ${q?.balance_due_date ? fmtDate(q.balance_due_date) : "–"}`
                          : "Settle everything now and relax."}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="flex justify-end">
              <Button size="lg" disabled={!ready || !q || !!quote.error} onClick={() => setStep(2)}>
                Continue to details <ArrowRight className="h-5 w-5" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="rounded-3xl border border-border bg-surface p-6">
              <h2 className="text-xl font-bold">Lead traveller &amp; contact</h2>
              <p className="text-sm text-muted">We&apos;ll send your confirmation, receipts and trip updates here.</p>
              {!user && (
                <p className="mt-2 text-sm">
                  Have an account?{" "}
                  <Link href={`/login?next=${encodeURIComponent(`/book/${tour.slug}`)}`} className="font-semibold text-primary underline">
                    Log in
                  </Link>{" "}
                  to save this trip to it.
                </p>
              )}
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Full name" error={errors.name}>
                  <Input autoComplete="name" value={contact.name} aria-invalid={!!errors.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
                </Field>
                <Field label="Email" error={errors.email}>
                  <Input type="email" autoComplete="email" value={contact.email} aria-invalid={!!errors.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
                </Field>
                <Field label="Phone (WhatsApp preferred)" error={errors.phone} hint="e.g. 0712 345 678 or +44 7700 900123">
                  <Input type="tel" autoComplete="tel" value={contact.phone} aria-invalid={!!errors.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
                </Field>
                <Field label="Country of residence">
                  <Select value={contact.country} onChange={(e) => setContact({ ...contact, country: e.target.value })}>
                    {COUNTRIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            </section>

            <section className="rounded-3xl border border-border bg-surface p-6">
              <h2 className="text-xl font-bold">Travellers</h2>
              <p className="text-sm text-muted">Names as they appear on ID or passport. Passport details can be added later.</p>
              <div className="mt-4 space-y-4">
                {travellers.map((t, i) => (
                  <div key={i} className="rounded-2xl bg-surface-2 p-4">
                    <p className="mb-3 text-sm font-bold">
                      Traveller {i + 1} · {i < adults ? "Adult" : "Child"} {i === 0 && <span className="font-normal text-muted">(lead)</span>}
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field error={errors[`t${i}`]}>
                        <Input
                          placeholder={i === 0 ? contact.name || "Full name" : "Full name"}
                          aria-label={`Traveller ${i + 1} name`}
                          value={t.full_name}
                          aria-invalid={!!errors[`t${i}`]}
                          onChange={(e) => setTravellers(travellers.map((x, j) => (j === i ? { ...x, full_name: e.target.value } : x)))}
                        />
                      </Field>
                      <Input
                        placeholder="Nationality"
                        aria-label={`Traveller ${i + 1} nationality`}
                        value={t.nationality}
                        onChange={(e) => setTravellers(travellers.map((x, j) => (j === i ? { ...x, nationality: e.target.value } : x)))}
                      />
                      <Input
                        placeholder="Passport / ID no. (optional)"
                        aria-label={`Traveller ${i + 1} passport`}
                        value={t.passport_number}
                        onChange={(e) => setTravellers(travellers.map((x, j) => (j === i ? { ...x, passport_number: e.target.value } : x)))}
                      />
                      <Input
                        placeholder="Dietary needs (optional)"
                        aria-label={`Traveller ${i + 1} dietary needs`}
                        value={t.dietary}
                        onChange={(e) => setTravellers(travellers.map((x, j) => (j === i ? { ...x, dietary: e.target.value } : x)))}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <Field label="Special requests" className="mt-5">
                <Textarea value={requests} onChange={(e) => setRequests(e.target.value)} placeholder="Celebrating something? Need a pick-up? Let us know." />
              </Field>
            </section>

            <section className="rounded-3xl border border-border bg-surface p-6">
              <Checkbox
                checked={terms}
                onChange={(e) => setTerms(e.target.checked)}
                label={
                  <>
                    I agree to the{" "}
                    <Link href="/booking-policy" target="_blank" className="font-semibold text-primary underline">
                      booking &amp; cancellation policy
                    </Link>{" "}
                    and{" "}
                    <Link href="/terms" target="_blank" className="font-semibold text-primary underline">
                      terms
                    </Link>
                    .
                  </>
                }
              />
              {errors.terms && <p className="mt-1 text-sm text-danger">{errors.terms}</p>}
            </section>

            <div className="flex flex-col-reverse justify-between gap-3 sm:flex-row">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button size="lg" loading={submitting} onClick={submit}>
                <Lock className="h-4 w-4" /> Reserve &amp; continue to payment
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Summary */}
      <aside>
        <div className="sticky top-28 space-y-4">
          <div className="overflow-hidden rounded-3xl border border-border bg-surface">
            <div className="flex gap-4 p-5">
              {tour.hero_image && (
                <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-2xl">
                  <Image src={tour.hero_image} alt="" fill sizes="96px" className="object-cover" />
                </div>
              )}
              <div>
                <p className="leading-snug font-bold">{tour.title}</p>
                <p className="text-sm text-muted">{duration(tour.duration_days, tour.duration_nights)}</p>
                {q && <p className="mt-1 text-sm font-semibold">{dateRange(q.travel_date, q.end_date)}</p>}
              </div>
            </div>
            <div className="border-t border-border p-5 text-sm" aria-live="polite">
              {!ready ? (
                <p className="text-muted">Choose your date to see the price.</p>
              ) : quote.isLoading ? (
                <p className="text-muted">Calculating your price…</p>
              ) : quote.error ? (
                <p className="text-danger">{(quote.error as Error).message}</p>
              ) : q ? (
                <>
                  {q.line_items.map((li) => (
                    <div key={li.label} className="flex justify-between gap-3 py-1">
                      <span className="text-muted">
                        {li.label} × {li.quantity}
                      </span>
                      <span>{money(li.amount, q.currency)}</span>
                    </div>
                  ))}
                  {q.discount > 0 && (
                    <div className="flex justify-between py-1 text-success">
                      <span>Promo {q.promo_code}</span>
                      <span>−{money(q.discount, q.currency)}</span>
                    </div>
                  )}
                  <div className="mt-2 flex justify-between border-t border-border pt-3 text-lg font-extrabold">
                    <span>Total</span>
                    <span>{money(q.total, q.currency)}</span>
                  </div>
                  <div className="mt-2 rounded-2xl bg-lime/15 p-3">
                    <div className="flex justify-between font-bold">
                      <span>{q.payment_plan === "full" ? "Due today" : `Deposit today (${q.deposit_percent}%)`}</span>
                      <span>{money(q.deposit_amount, q.currency)}</span>
                    </div>
                    {q.payment_plan === "deposit" && (
                      <p className="mt-1 text-xs text-muted">
                        Then {money(q.total - q.deposit_amount, q.currency)} by {fmtDate(q.balance_due_date)}
                      </p>
                    )}
                  </div>
                </>
              ) : null}
              <form
                className="mt-4 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setPromo(promoInput.trim() || null);
                }}
              >
                <label htmlFor="promo" className="sr-only">
                  Promo code
                </label>
                <div className="relative flex-1">
                  <Tag className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
                  <Input id="promo" value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} placeholder="Promo code" className="h-10 pl-9 text-sm" />
                </div>
                <Button type="submit" variant="outline" size="sm" className="h-10">
                  Apply
                </Button>
              </form>
              {q?.promo_message && promo && (
                <p className={cn("mt-1 text-xs", q.discount > 0 ? "text-success" : "text-danger")}>{q.promo_message}</p>
              )}
            </div>
          </div>
          <div className="rounded-3xl border border-border bg-surface p-5 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <Lock className="h-4 w-4 text-lime-strong" /> Secure payment on the next step
            </p>
            <PaymentLogos light className="mt-3" />
          </div>
        </div>
      </aside>
    </div>
  );
}
