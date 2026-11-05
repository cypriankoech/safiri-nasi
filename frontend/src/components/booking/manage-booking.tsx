"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock, Download, FileText, MapPin, PartyPopper, Receipt, Ticket, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BookingStatusBadge, PaymentStatusBadge, Skeleton } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { api, ApiError, bookingTokens } from "@/lib/api";
import { dateRange, daysUntil, fmtDate, fmtDateTime, METHOD_LABELS, money } from "@/lib/format";
import type { Booking, SiteSettings } from "@/lib/types";
import { useClientValue } from "@/lib/use-client-value";
import { whatsappLink } from "@/lib/utils";
import { PaymentPanel } from "./payment-panel";

function HoldCountdown({ until }: { until: string }) {
  const [left, setLeft] = useState(() => new Date(until).getTime() - Date.now());
  useEffect(() => {
    const t = setInterval(() => setLeft(new Date(until).getTime() - Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  if (left <= 0) return <span>Your hold has lapsed. Pay now to re-hold your seats if they&apos;re still available.</span>;
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return (
    <span>
      Seats held for{" "}
      <b className="tabular-nums">
        {m}:{String(s).padStart(2, "0")}
      </b>
      . Pay to confirm.
    </span>
  );
}

export function ManageBooking({
  reference,
  urlToken,
  isNew,
  settings,
}: {
  reference: string;
  urlToken: string | null;
  isNew: boolean;
  settings: SiteSettings;
}) {
  // Guest access comes from the emailed link (?t=) or a token saved on this device at checkout.
  const stored = useClientValue<string | undefined>(() => bookingTokens.get(reference) ?? "", undefined);
  const token = urlToken ?? (stored || null);
  const tokenChecked = urlToken !== null || stored !== undefined;

  useEffect(() => {
    if (urlToken) bookingTokens.set(reference, urlToken);
  }, [reference, urlToken]);

  const query = useQuery({
    queryKey: ["booking", reference, token],
    queryFn: () => api<Booking>(`/api/bookings/${reference}`, { bookingToken: token }),
    enabled: tokenChecked,
    retry: false,
  });
  const refetch = query.refetch;
  const onPaid = useCallback(() => {
    setTimeout(() => refetch(), 600);
  }, [refetch]);

  if (!tokenChecked || query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (query.error || !query.data) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-border bg-surface p-8 text-center">
        <Ticket className="mx-auto h-10 w-10 text-muted" />
        <h2 className="mt-3 text-xl font-bold">{notFound ? "We need to confirm it's you" : "Couldn't load this booking"}</h2>
        <p className="mt-1 text-muted">Open the link in your booking email, or look up the booking with your email address.</p>
        <Link href={`/booking?ref=${reference}`} className={buttonClass({ className: "mt-5" })}>
          Find my booking
        </Link>
      </div>
    );
  }

  const b = query.data;
  const tq = token ? `?t=${encodeURIComponent(token)}` : "";
  const confirmed = ["confirmed", "fully_paid", "completed"].includes(b.status);
  const days = daysUntil(b.travel_date);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-6">
        {isNew && b.status === "pending_payment" && (
          <div className="flex items-start gap-3 rounded-3xl bg-lime/20 p-5">
            <PartyPopper className="h-6 w-6 shrink-0 text-lime-strong" />
            <div>
              <p className="font-bold">Your seats are reserved!</p>
              <p className="text-sm text-muted">
                Booking reference <b className="text-text">{b.reference}</b>. We&apos;ve emailed the details to {b.contact_email}.
              </p>
            </div>
          </div>
        )}
        {confirmed && b.balance <= 0 && b.status !== "completed" && (
          <div className="flex items-start gap-3 rounded-3xl bg-success-bg p-5 text-success">
            <PartyPopper className="h-6 w-6 shrink-0" />
            <p className="font-semibold">You&apos;re all paid up. Pack your bags! {days > 0 && `${days} days to go.`}</p>
          </div>
        )}

        <div className="overflow-hidden rounded-3xl border border-border bg-surface">
          <div className="relative h-40 bg-surface-3">
            {b.tour.hero_image && <Image src={b.tour.hero_image} alt="" fill sizes="(min-width: 1024px) 60vw, 100vw" className="object-cover" />}
            <div className="absolute inset-0 bg-gradient-to-t from-forest-deep/90 to-transparent" />
            <div className="absolute bottom-0 p-5 text-white">
              <p className="text-sm text-white/80">Booking {b.reference}</p>
              <Link href={`/tours/${b.tour.slug}`} className="text-2xl font-extrabold hover:underline">
                {b.tour.title}
              </Link>
            </div>
            <div className="absolute top-4 right-4">
              <BookingStatusBadge status={b.status} />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-4 p-5 text-sm md:grid-cols-4">
            <div>
              <dt className="flex items-center gap-1.5 text-muted">
                <CalendarDays className="h-4 w-4" /> Dates
              </dt>
              <dd className="font-semibold">{dateRange(b.travel_date, b.end_date)}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-muted">
                <Users className="h-4 w-4" /> Travellers
              </dt>
              <dd className="font-semibold">
                {b.adults} adult{b.adults !== 1 && "s"}
                {b.children > 0 && `, ${b.children} child${b.children !== 1 ? "ren" : ""}`}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-muted">
                <MapPin className="h-4 w-4" /> Start
              </dt>
              <dd className="font-semibold">{b.tour.start_location ?? "TBC"}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-muted">
                <Clock className="h-4 w-4" /> Balance due
              </dt>
              <dd className="font-semibold">{b.balance > 0 ? fmtDate(b.balance_due_date) : "Paid"}</dd>
            </div>
          </dl>
          {b.status === "pending_payment" && b.hold_expires_at && (
            <p className="border-t border-border bg-warning-bg px-5 py-3 text-sm text-warning">
              <HoldCountdown until={b.hold_expires_at} />
            </p>
          )}
        </div>

        {(b.status === "pending_payment" || b.status === "expired" || b.balance > 0) &&
          !["cancelled", "refunded", "completed"].includes(b.status) && (
            <div id="pay">
              <PaymentPanel booking={b} token={token} settings={settings} onPaid={onPaid} />
            </div>
          )}

        <section className="rounded-3xl border border-border bg-surface p-6">
          <h2 className="text-lg font-bold">Payments</h2>
          {b.payments.length ? (
            <ul className="mt-3 divide-y divide-border text-sm">
              {b.payments.map((p) => (
                <li key={p.reference} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span>
                    <b>{METHOD_LABELS[p.method]}</b> · {fmtDateTime(p.paid_at ?? p.created_at)}
                    {p.receipt_number && <span className="block text-xs text-muted">Receipt {p.receipt_number}</span>}
                    {p.status === "failed" && p.failure_reason && <span className="block text-xs text-danger">{p.failure_reason}</span>}
                  </span>
                  <span className="flex items-center gap-3">
                    <b>{money(p.amount, p.currency)}</b>
                    <PaymentStatusBadge status={p.status} />
                    {p.status === "success" && (
                      <a href={`/api/payments/${p.reference}/receipt.pdf${tq}`} target="_blank" className="text-primary" aria-label="Download receipt">
                        <Receipt className="h-4 w-4" />
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">No payments yet.</p>
          )}
        </section>

        <section className="rounded-3xl border border-border bg-surface p-6">
          <h2 className="text-lg font-bold">Travellers</h2>
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {b.travellers.map((t) => (
              <li key={t.id} className="rounded-2xl bg-surface-2 p-3">
                <b>{t.full_name}</b> {t.is_lead && <span className="text-xs text-muted">(lead)</span>}
                <span className="block text-xs text-muted capitalize">
                  {t.traveller_type}
                  {t.nationality && ` · ${t.nationality}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Need to change names or add passport details?{" "}
            <a href={whatsappLink(settings.whatsapp, `Hi! I'd like to update traveller details for booking ${b.reference}.`)} className="font-semibold text-primary underline" target="_blank" rel="noreferrer">
              Message us on WhatsApp
            </a>
            .
          </p>
        </section>
      </div>

      <aside className="space-y-4">
        <div className="sticky top-28 space-y-4">
          <div className="rounded-3xl border border-border bg-surface p-5 text-sm">
            <h2 className="mb-3 text-lg font-bold">Price summary</h2>
            {b.line_items.map((li) => (
              <div key={li.label} className="flex justify-between gap-3 py-1">
                <span className="text-muted">
                  {li.label} × {li.quantity}
                </span>
                <span>{money(li.amount, b.currency)}</span>
              </div>
            ))}
            {b.discount > 0 && (
              <div className="flex justify-between py-1 text-success">
                <span>Discount {b.promo_code}</span>
                <span>−{money(b.discount, b.currency)}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-border pt-2 font-bold">
              <span>Total</span>
              <span>{money(b.total, b.currency)}</span>
            </div>
            <div className="flex justify-between py-1 text-success">
              <span>Paid</span>
              <span>{money(b.amount_paid, b.currency)}</span>
            </div>
            <div className="flex justify-between text-base font-extrabold">
              <span>Balance</span>
              <span>{money(b.balance, b.currency)}</span>
            </div>
          </div>
          <div className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="mb-3 text-lg font-bold">Documents</h2>
            <div className="space-y-2">
              <a href={`/api/bookings/${b.reference}/invoice.pdf${tq}`} target="_blank" className={buttonClass({ variant: "outline", className: "w-full justify-start" })}>
                <FileText className="h-4 w-4" /> Invoice
              </a>
              {confirmed ? (
                <a href={`/api/bookings/${b.reference}/voucher.pdf${tq}`} target="_blank" className={buttonClass({ variant: "outline", className: "w-full justify-start" })}>
                  <Download className="h-4 w-4" /> Travel voucher
                </a>
              ) : (
                <p className="text-xs text-muted">Your travel voucher is available once the booking is confirmed.</p>
              )}
            </div>
          </div>
          <a href={whatsappLink(settings.whatsapp, `Hi Safiri Nasi! Question about booking ${b.reference}.`)} target="_blank" rel="noreferrer" className={buttonClass({ variant: "dark", className: "w-full" })}>
            Questions? Chat with us
          </a>
        </div>
      </aside>
    </div>
  );
}
