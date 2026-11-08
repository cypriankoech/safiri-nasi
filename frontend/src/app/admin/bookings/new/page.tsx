"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Stepper, Textarea } from "@/components/ui/field";
import { api } from "@/lib/api";
import type { AdminBooking, TourRow } from "@/lib/admin-types";
import { dateRange, money } from "@/lib/format";
import type { Currency, Quote, RateCategory, TourDetail } from "@/lib/types";

export default function NewBookingPage() {
  const router = useRouter();
  const tours = useQuery({ queryKey: ["admin", "tours"], queryFn: () => api<TourRow[]>("/api/admin/tours") });
  const [slug, setSlug] = useState("");
  const tour = useQuery({
    queryKey: ["tour", slug],
    enabled: !!slug,
    queryFn: () => api<TourDetail>(`/api/tours/${slug}?preview=true`),
  });
  const [departureId, setDepartureId] = useState<number | null>(null);
  const [date, setDate] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [rate, setRate] = useState<RateCategory>("resident");
  const [currency, setCurrency] = useState<Currency>("KES");
  const [plan, setPlan] = useState<"deposit" | "full">("deposit");
  const [contact, setContact] = useState({ contact_name: "", contact_email: "", contact_phone: "", contact_country: "Kenya" });
  const [source, setSource] = useState("phone");
  const [holdHours, setHoldHours] = useState(48);
  const [notify, setNotify] = useState(true);
  const [notes, setNotes] = useState("");

  const t = tour.data;
  const scheduled = t?.tour_type === "scheduled";
  const body = {
    tour_slug: slug,
    departure_id: scheduled ? departureId : null,
    travel_date: scheduled ? null : date || null,
    adults,
    children,
    rate_category: rate,
    currency,
    payment_plan: plan,
  };
  const ready = !!t && (scheduled ? !!departureId : !!date);
  const quote = useQuery({
    queryKey: ["admin-quote", body],
    enabled: ready,
    retry: false,
    queryFn: () => api<Quote>("/api/quote", { body }),
  });

  const create = useMutation({
    mutationFn: () =>
      api<AdminBooking>("/api/admin/bookings", {
        body: { ...body, ...contact, source, hold_hours: holdHours, notify_customer: notify, internal_notes: notes || null },
      }),
    onSuccess: (b) => {
      toast.success(`Booking ${b.reference} created`);
      router.push(`/admin/bookings/${b.reference}`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader back={<Link href="/admin/bookings" className="text-sm text-muted">← Bookings</Link>} title="New booking" description="For bookings taken by phone, WhatsApp or in the office. The customer gets an email with a secure payment link." />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Panel title="Trip">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tour" className="sm:col-span-2">
                <Select value={slug} onChange={(e) => { setSlug(e.target.value); setDepartureId(null); }}>
                  <option value="">Choose a tour…</option>
                  {tours.data?.filter((x) => x.status !== "archived").map((x) => <option key={x.id} value={x.slug}>{x.title}{x.status === "draft" ? " (draft)" : ""}</option>)}
                </Select>
              </Field>
              {t && (scheduled ? (
                <Field label="Departure" className="sm:col-span-2">
                  <Select value={departureId ?? ""} onChange={(e) => setDepartureId(Number(e.target.value) || null)}>
                    <option value="">Choose…</option>
                    {t.departures.filter((d) => d.is_bookable).map((d) => <option key={d.id} value={d.id}>{dateRange(d.start_date, d.end_date)} · {d.seats_left} left</option>)}
                  </Select>
                </Field>
              ) : (
                <Field label="Start date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              ))}
              <div className="flex items-center gap-6">
                <div><p className="mb-1 text-sm font-semibold">Adults</p><Stepper label="adults" value={adults} min={1} max={60} onChange={setAdults} /></div>
                <div><p className="mb-1 text-sm font-semibold">Children</p><Stepper label="children" value={children} min={0} max={60} onChange={setChildren} /></div>
              </div>
              <Field label="Rate">
                <Select value={rate} onChange={(e) => setRate(e.target.value as RateCategory)}><option value="resident">Resident</option><option value="non_resident">Non-resident</option></Select>
              </Field>
              <Field label="Currency">
                <Select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}><option>KES</option><option>USD</option></Select>
              </Field>
              <Field label="Payment plan">
                <Select value={plan} onChange={(e) => setPlan(e.target.value as "deposit" | "full")}><option value="deposit">Deposit then balance</option><option value="full">Pay in full</option></Select>
              </Field>
            </div>
          </Panel>
          <Panel title="Customer">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name"><Input value={contact.contact_name} onChange={(e) => setContact({ ...contact, contact_name: e.target.value })} /></Field>
              <Field label="Email"><Input type="email" value={contact.contact_email} onChange={(e) => setContact({ ...contact, contact_email: e.target.value })} /></Field>
              <Field label="Phone"><Input value={contact.contact_phone} onChange={(e) => setContact({ ...contact, contact_phone: e.target.value })} /></Field>
              <Field label="Country"><Input value={contact.contact_country} onChange={(e) => setContact({ ...contact, contact_country: e.target.value })} /></Field>
              <Field label="Source">
                <Select value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="phone">Phone</option><option value="whatsapp">WhatsApp</option><option value="walk_in">Walk-in</option><option value="email">Email</option><option value="agent">Agent / partner</option>
                </Select>
              </Field>
              <Field label="Hold seats for (hours)" hint="0 = hold until cancelled">
                <Input type="number" min={0} max={720} value={holdHours} onChange={(e) => setHoldHours(Number(e.target.value))} />
              </Field>
            </div>
            <Field label="Internal notes" className="mt-4"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
            <Checkbox className="mt-4" checked={notify} onChange={(e) => setNotify(e.target.checked)} label="Email the customer their booking and payment link" />
          </Panel>
        </div>
        <aside>
          <Panel title="Price">
            {!ready ? (
              <p className="text-sm text-muted">Choose a tour and date.</p>
            ) : quote.error ? (
              <p className="text-sm text-danger">{quote.error.message}</p>
            ) : quote.data ? (
              <div className="space-y-1 text-sm">
                {quote.data.line_items.map((li) => <div key={li.label} className="flex justify-between"><span className="text-muted">{li.label} × {li.quantity}</span><span>{money(li.amount, currency)}</span></div>)}
                <div className="flex justify-between border-t border-border pt-2 font-bold"><span>Total</span><span>{money(quote.data.total, currency)}</span></div>
                <div className="flex justify-between text-lime-strong"><span>Due first</span><span>{money(quote.data.deposit_amount, currency)}</span></div>
              </div>
            ) : (
              <p className="text-sm text-muted">Calculating…</p>
            )}
            <Button className="mt-5 w-full" disabled={!quote.data || !contact.contact_name || !contact.contact_email || !contact.contact_phone} loading={create.isPending} onClick={() => create.mutate()}>
              Create booking
            </Button>
          </Panel>
        </aside>
      </div>
    </>
  );
}
