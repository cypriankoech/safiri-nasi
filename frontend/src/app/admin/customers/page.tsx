"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { EmptyRow, PageHeader, SearchInput, Table, TableSkeleton } from "@/components/admin/ui";
import { Badge } from "@/components/ui/misc";
import { api } from "@/lib/api";
import type { CustomerRow } from "@/lib/admin-types";
import { fmtShortDate, money } from "@/lib/format";

export default function CustomersPage() {
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "customers", q],
    queryFn: () => api<CustomerRow[]>(`/api/admin/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  });
  return (
    <>
      <PageHeader title="Customers" description="Everyone who has booked, grouped by email. Sorted by lifetime spend." />
      <SearchInput value={q} onChange={setQ} placeholder="Name, email or phone" className="mb-4 w-full sm:w-80" />
      {isLoading ? <TableSkeleton /> : (
        <Table>
          <thead><tr><th>Customer</th><th>Phone</th><th>Country</th><th>Trips</th><th>Last travel</th><th className="text-right!">Spent (KES eq.)</th></tr></thead>
          <tbody>
            {data?.length ? data.map((c) => (
              <tr key={c.email} className="hover:bg-surface-2">
                <td>
                  <Link href={`/admin/customers/${encodeURIComponent(c.email)}`} className="font-semibold text-primary">{c.name}</Link>
                  <span className="block text-xs text-muted">{c.email} {c.has_account && <Badge tone="green" className="ml-1">account</Badge>}</span>
                </td>
                <td>{c.phone}</td>
                <td>{c.country ?? "—"}</td>
                <td>{c.trips}{c.bookings > c.trips && <span className="text-xs text-muted"> (+{c.bookings - c.trips} cancelled)</span>}</td>
                <td>{fmtShortDate(c.last_travel_date)}</td>
                <td className="text-right font-semibold">{money(c.spent_kes, "KES")}</td>
              </tr>
            )) : <EmptyRow cols={6}>No customers yet.</EmptyRow>}
          </tbody>
        </Table>
      )}
    </>
  );
}
