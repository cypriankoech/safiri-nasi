"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { EmptyRow, PageHeader, Pager, SearchInput, Table, TableSkeleton } from "@/components/admin/ui";
import { ButtonLink } from "@/components/ui/button";
import { Checkbox, Select } from "@/components/ui/field";
import { BookingStatusBadge } from "@/components/ui/misc";
import { api } from "@/lib/api";
import type { BookingRow } from "@/lib/admin-types";
import { fmtDateTime, fmtShortDate, money, STATUS_LABELS } from "@/lib/format";
import type { Page } from "@/lib/types";

const PAGE_SIZE = 25;

export default function BookingsPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [balanceDue, setBalanceDue] = useState(sp.get("balance_due") === "1");
  const [sort, setSort] = useState<"created" | "travel">("created");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), sort });
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (balanceDue) params.set("balance_due", "true");
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "bookings", params.toString()],
    queryFn: () => api<Page<BookingRow>>(`/api/admin/bookings?${params}`),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Every booking from the website, WhatsApp, phone and walk-ins."
        actions={
          <>
            <ButtonLink href="/api/admin/reports/bookings.csv" variant="outline" size="sm" target="_blank">
              <Download className="h-4 w-4" /> Export CSV
            </ButtonLink>
            <ButtonLink href="/admin/bookings/new" size="sm">
              <Plus className="h-4 w-4" /> New booking
            </ButtonLink>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Reference, name, email, phone or tour" className="w-full sm:w-80" />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-10 w-48 text-sm" aria-label="Status">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as "created" | "travel")} className="h-10 w-44 text-sm" aria-label="Sort">
          <option value="created">Newest first</option>
          <option value="travel">By travel date</option>
        </Select>
        <Checkbox label="Balance outstanding" checked={balanceDue} onChange={(e) => { setBalanceDue(e.target.checked); setPage(1); }} />
      </div>
      {isLoading ? (
        <TableSkeleton />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <th>Booking</th>
                <th>Customer</th>
                <th>Travel</th>
                <th className="text-right!">Total</th>
                <th className="text-right!">Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.length ? (
                data.items.map((b) => (
                  <tr key={b.reference} className="cursor-pointer hover:bg-surface-2" onClick={() => router.push(`/admin/bookings/${b.reference}`)}>
                    <td>
                      <Link href={`/admin/bookings/${b.reference}`} className="font-bold text-primary">{b.reference}</Link>
                      <span className="block text-xs text-muted">{fmtDateTime(b.created_at)} · {b.source}</span>
                    </td>
                    <td>
                      {b.contact_name}
                      <span className="block text-xs text-muted">{b.contact_phone}</span>
                    </td>
                    <td>
                      <span className="line-clamp-1">{b.tour_title}</span>
                      <span className="block text-xs text-muted">{fmtShortDate(b.travel_date)} · {b.adults + b.children} pax</span>
                    </td>
                    <td className="text-right font-semibold">{money(b.total, b.currency)}</td>
                    <td className="text-right">
                      {b.balance > 0 ? <span className="font-semibold text-maroon">{money(b.balance, b.currency)}</span> : <span className="text-muted">—</span>}
                      {b.balance > 0 && b.balance_due_date && <span className="block text-xs text-muted">due {fmtShortDate(b.balance_due_date)}</span>}
                    </td>
                    <td><BookingStatusBadge status={b.status} /></td>
                  </tr>
                ))
              ) : (
                <EmptyRow cols={6}>No bookings match.</EmptyRow>
              )}
            </tbody>
          </Table>
          <Pager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPage={setPage} />
        </>
      )}
    </>
  );
}
