"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Banknote, CalendarRange, Inbox, MessageSquareQuote, Ticket, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader, Panel, Stat } from "@/components/admin/ui";
import { BookingStatusBadge, PaymentStatusBadge, Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/api";
import type { Dashboard } from "@/lib/admin-types";
import { compactMoney, fmtDateTime, fmtShortDate, METHOD_LABELS, money } from "@/lib/format";

const METHOD_COLORS: Record<string, string> = {
  mpesa: "#3aa935",
  airtel: "#e3262b",
  card: "#1e3b1c",
  paybill: "#7dc242",
  bank: "#8f8f1e",
  cash: "#f29f1d",
};

export default function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["admin", "dashboard"], queryFn: () => api<Dashboard>("/api/admin/dashboard") });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
        <Skeleton className="h-80" />
      </div>
    );
  }
  const k = data.kpis;
  const change = k.revenue_last_month ? ((k.revenue_this_month - k.revenue_last_month) / k.revenue_last_month) * 100 : null;
  const alerts = [
    k.unmatched_payments > 0 && { href: "/admin/payments?tab=unmatched", text: `${k.unmatched_payments} Paybill payment(s) need matching to a booking` },
    k.overdue_balances > 0 && { href: "/admin/bookings?balance_due=1", text: `${k.overdue_balances} booking(s) with overdue balances` },
    k.new_enquiries > 0 && { href: "/admin/enquiries?status=new", text: `${k.new_enquiries} new enquiry(ies) waiting for a reply` },
    k.pending_reviews > 0 && { href: "/admin/reviews?status=pending", text: `${k.pending_reviews} review(s) to moderate` },
  ].filter(Boolean) as { href: string; text: string }[];

  return (
    <>
      <PageHeader title="Dashboard" description={`Revenue in KES equivalent · USD at ${data.fx_usd_kes}`} />
      {alerts.length > 0 && (
        <div className="mb-6 grid gap-2 md:grid-cols-2">
          {alerts.map((a) => (
            <Link key={a.href} href={a.href} className="flex items-center gap-3 rounded-xl bg-warning-bg px-4 py-3 text-sm font-semibold text-warning hover:brightness-95">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {a.text}
            </Link>
          ))}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Revenue this month"
          value={money(k.revenue_this_month, "KES")}
          hint={change === null ? "No revenue last month" : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(0)}% vs last month`}
          icon={<Banknote className="h-5 w-5 text-lime-strong" />}
        />
        <Stat label="Outstanding balances" value={money(k.outstanding_balances, "KES")} hint={`${k.overdue_balances} overdue`} tone={k.overdue_balances ? "warn" : "default"} icon={<Wallet className="h-5 w-5 text-sun-strong" />} />
        <Stat label="Bookings this month" value={k.bookings_this_month} hint={`${k.pending_payment} awaiting payment`} icon={<Ticket className="h-5 w-5 text-lime-strong" />} />
        <Stat label="Travellers next 30 days" value={k.travellers_next_30} hint="Confirmed & paid" icon={<Users className="h-5 w-5 text-lime-strong" />} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Panel title="Revenue, last 12 months">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.revenue_by_month} margin={{ left: 8, right: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} />
                <YAxis tickFormatter={(v) => compactMoney(v).replace("KES ", "")} tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} width={48} />
                <Tooltip
                  cursor={{ fill: "var(--surface-2)" }}
                  formatter={(v) => money(Number(v), "KES")}
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}
                />
                <Bar dataKey="kes" name="Revenue" fill="var(--lime)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="This month by method">
          {data.revenue_by_method.length ? (
            <>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.revenue_by_method} dataKey="kes" nameKey="method" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {data.revenue_by_method.map((m) => (
                        <Cell key={m.method} fill={METHOD_COLORS[m.method] ?? "#999"} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => money(Number(v), "KES")} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                {data.revenue_by_method.map((m) => (
                  <li key={m.method} className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: METHOD_COLORS[m.method] }} /> {METHOD_LABELS[m.method]}
                    </span>
                    <b>{money(m.kes, "KES")}</b>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted">No payments yet this month.</p>
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Recent bookings" actions={<Link href="/admin/bookings" className="text-sm font-semibold text-primary">View all</Link>} bodyClassName="p-0">
          <ul className="divide-y divide-border text-sm">
            {data.recent_bookings.map((b) => (
              <li key={b.reference}>
                <Link href={`/admin/bookings/${b.reference}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2">
                  <span className="min-w-0">
                    <b>{b.contact_name}</b> <span className="text-muted">· {b.reference}</span>
                    <span className="block truncate text-xs text-muted">{b.tour} · {fmtDateTime(b.created_at)}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <b>{money(b.total, b.currency)}</b>
                    <BookingStatusBadge status={b.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Recent payments" actions={<Link href="/admin/payments" className="text-sm font-semibold text-primary">Ledger</Link>} bodyClassName="p-0">
          <ul className="divide-y divide-border text-sm">
            {data.recent_payments.map((p) => (
              <li key={p.reference}>
                <Link href={`/admin/bookings/${p.booking_reference}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2">
                  <span>
                    <b>{METHOD_LABELS[p.method]}</b> <span className="text-muted">· {p.booking_reference}</span>
                    <span className="block text-xs text-muted">{fmtDateTime(p.created_at)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <b>{money(p.amount, p.currency)}</b>
                    <PaymentStatusBadge status={p.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Upcoming departures" actions={<Link href="/admin/departures" className="text-sm font-semibold text-primary">All departures</Link>} bodyClassName="p-0">
          <ul className="divide-y divide-border text-sm">
            {data.upcoming_departures.map((d) => {
              const pct = Math.round((d.seats_booked / d.capacity) * 100);
              return (
                <li key={d.id} className="flex items-center gap-4 px-5 py-3">
                  <CalendarRange className="h-5 w-5 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate">{d.tour}</b>
                    <span className="text-xs text-muted">{fmtShortDate(d.start_date)}</span>
                  </span>
                  <span className="w-32">
                    <span className="mb-1 block text-right text-xs text-muted">
                      {d.seats_booked}/{d.capacity} booked
                    </span>
                    <span className="block h-2 overflow-hidden rounded-full bg-surface-3">
                      <span className="block h-full rounded-full bg-lime" style={{ width: `${pct}%` }} />
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel title="Top tours (last 90 days)">
          {data.top_tours.length ? (
            <ul className="space-y-3 text-sm">
              {data.top_tours.map((t) => {
                const max = data.top_tours[0].kes || 1;
                return (
                  <li key={t.tour}>
                    <div className="flex justify-between">
                      <span className="truncate">{t.tour}</span>
                      <b>{money(t.kes, "KES")}</b>
                    </div>
                    <span className="mt-1 block h-2 rounded-full bg-surface-3">
                      <span className="block h-full rounded-full bg-sun" style={{ width: `${(t.kes / max) * 100}%` }} />
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">No sales yet.</p>
          )}
          <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <Link href="/admin/enquiries" className="flex items-center gap-2 rounded-xl bg-surface-2 p-3 hover:bg-surface-3">
              <Inbox className="h-4 w-4" /> {k.new_enquiries} new enquiries
            </Link>
            <Link href="/admin/reviews" className="flex items-center gap-2 rounded-xl bg-surface-2 p-3 hover:bg-surface-3">
              <MessageSquareQuote className="h-4 w-4" /> {k.pending_reviews} reviews to check
            </Link>
          </div>
        </Panel>
      </div>
    </>
  );
}
