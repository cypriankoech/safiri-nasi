"use client";

import { useQuery } from "@tanstack/react-query";
import { format, startOfYear, subDays } from "date-fns";
import { Download } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader, Panel, Stat, Table } from "@/components/admin/ui";
import { ButtonLink } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { compactMoney, METHOD_LABELS, money, STATUS_LABELS } from "@/lib/format";
import type { BookingStatus, PaymentMethod } from "@/lib/types";

type Revenue = {
  total_kes: number;
  gateway_fees_kes: number;
  partner_share_kes: number;
  partner_name: string;
  net_kes: number;
  payments: number;
  fx_usd_kes: number;
  series: { period: string; kes: number }[];
  by_method: { method: PaymentMethod; count: number; kes: number }[];
  by_tour: { tour: string; count: number; kes: number }[];
  by_currency: Record<string, number>;
};
type Bookings = {
  total: number;
  travellers: number;
  conversion_rate: number | null;
  avg_lead_days: number | null;
  by_status: Record<string, number>;
  by_source: Record<string, number>;
  by_rate_category: Record<string, number>;
  by_tour: { tour: string; count: number }[];
};

const fmt = (d: Date) => format(d, "yyyy-MM-dd");

export default function ReportsPage() {
  const [from, setFrom] = useState(() => fmt(startOfYear(new Date())));
  const [to, setTo] = useState(() => fmt(new Date()));
  const [group, setGroup] = useState("month");
  const q = `date_from=${from}&date_to=${to}`;
  const revenue = useQuery({ queryKey: ["admin", "rev", q, group], queryFn: () => api<Revenue>(`/api/admin/reports/revenue?${q}&group=${group}`) });
  const bookings = useQuery({ queryKey: ["admin", "bk", q], queryFn: () => api<Bookings>(`/api/admin/reports/bookings?${q}`) });
  const presets = [
    { label: "Last 30 days", from: fmt(subDays(new Date(), 30)) },
    { label: "Last 90 days", from: fmt(subDays(new Date(), 90)) },
    { label: "This year", from: fmt(startOfYear(new Date())) },
    { label: "Last 12 months", from: fmt(subDays(new Date(), 365)) },
  ];
  const r = revenue.data;
  const b = bookings.data;

  return (
    <>
      <PageHeader
        title="Reports"
        description="Revenue counts successful payments by the date they were received. USD is converted at the current rate."
        actions={
          <>
            <ButtonLink href={`/api/admin/payments/export.csv?${q}`} target="_blank" variant="outline" size="sm"><Download className="h-4 w-4" /> Payments CSV</ButtonLink>
            <ButtonLink href={`/api/admin/reports/bookings.csv?${q}`} target="_blank" variant="outline" size="sm"><Download className="h-4 w-4" /> Bookings CSV</ButtonLink>
          </>
        }
      />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10" /></Field>
        <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10" /></Field>
        <Field label="Group by">
          <Select value={group} onChange={(e) => setGroup(e.target.value)} className="h-10 w-32"><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></Select>
        </Field>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button key={p.label} onClick={() => { setFrom(p.from); setTo(fmt(new Date())); }} className="h-10 rounded-full bg-surface-2 px-3 text-sm font-semibold hover:bg-surface-3">{p.label}</button>
          ))}
        </div>
      </div>
      {!r || !b ? <Skeleton className="h-96" /> : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Revenue (KES eq.)" value={money(r.total_kes, "KES")} hint={`${r.payments} payments`} />
            <Stat label="Bookings created" value={b.total} hint={`${b.travellers} travellers`} />
            <Stat label="Conversion to paid" value={b.conversion_rate === null ? "—" : `${Math.round(b.conversion_rate * 100)}%`} hint="Bookings that paid at least the deposit" />
            <Stat label="Avg. booking lead time" value={b.avg_lead_days === null ? "—" : `${b.avg_lead_days} days`} hint="Booking to travel date" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Paystack fees" value={money(r.gateway_fees_kes, "KES")} hint="Charged to Safiri Nasi" />
            <Stat label={`${r.partner_name} share`} value={money(r.partner_share_kes, "KES")} hint="Settled to its Paystack subaccount" />
            <Stat label="Net to Safiri Nasi" value={money(r.net_kes, "KES")} hint="Revenue − fees − partner share" tone="good" />
          </div>
          <Panel title="Revenue over time">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={r.series}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="period" tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => compactMoney(v).replace("KES ", "")} tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} width={48} />
                  <Tooltip formatter={(v) => money(Number(v), "KES")} cursor={{ fill: "var(--surface-2)" }} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }} />
                  <Bar dataKey="kes" name="Revenue" fill="var(--sun)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="By payment method" bodyClassName="p-0">
              <Table className="rounded-none border-0">
                <thead><tr><th>Method</th><th>Payments</th><th className="text-right!">KES eq.</th></tr></thead>
                <tbody>{r.by_method.map((m) => <tr key={m.method}><td>{METHOD_LABELS[m.method]}</td><td>{m.count}</td><td className="text-right font-semibold">{money(m.kes, "KES")}</td></tr>)}</tbody>
              </Table>
              <p className="px-5 py-3 text-xs text-muted">Actual currencies: {Object.entries(r.by_currency).map(([c, v]) => money(v, c)).join(" · ") || "—"}</p>
            </Panel>
            <Panel title="By tour" bodyClassName="p-0">
              <Table className="rounded-none border-0">
                <thead><tr><th>Tour</th><th>Payments</th><th className="text-right!">KES eq.</th></tr></thead>
                <tbody>{r.by_tour.map((t) => <tr key={t.tour}><td>{t.tour}</td><td>{t.count}</td><td className="text-right font-semibold">{money(t.kes, "KES")}</td></tr>)}</tbody>
              </Table>
            </Panel>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <Breakdown title="Bookings by status" data={b.by_status} label={(k) => STATUS_LABELS[k as BookingStatus] ?? k} />
            <Breakdown title="Bookings by channel" data={b.by_source} label={(k) => k.replace("_", " ")} />
            <Breakdown title="Residents vs visitors" data={b.by_rate_category} label={(k) => (k === "resident" ? "Residents" : "Non-residents")} />
          </div>
        </div>
      )}
    </>
  );
}

function Breakdown({ title, data, label }: { title: string; data: Record<string, number>; label: (k: string) => string }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
  return (
    <Panel title={title}>
      <ul className="space-y-3 text-sm">
        {Object.entries(data).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
          <li key={k}>
            <div className="flex justify-between capitalize"><span>{label(k)}</span><b>{v}</b></div>
            <span className="mt-1 block h-1.5 rounded-full bg-surface-3"><span className="block h-full rounded-full bg-lime" style={{ width: `${(v / total) * 100}%` }} /></span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
