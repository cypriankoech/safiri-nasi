"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader, Panel, Table } from "@/components/admin/ui";
import { BookingStatusBadge, Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { fmtDateTime, fmtShortDate, money } from "@/lib/format";
import type { BookingStatus, Currency } from "@/lib/types";

type CustomerDetail = {
  email: string;
  name: string;
  phone: string;
  country: string | null;
  account: { id: number; created_at: string; last_login_at: string | null } | null;
  bookings: { reference: string; tour: string; travel_date: string; status: BookingStatus; currency: Currency; total: number; amount_paid: number; balance: number }[];
  enquiries: { id: number; kind: string; status: string; created_at: string; message: string | null }[];
};

export default function CustomerPage() {
  const { email } = useParams<{ email: string }>();
  const decoded = decodeURIComponent(email);
  const { data } = useQuery({ queryKey: ["admin", "customer", decoded], queryFn: () => api<CustomerDetail>(`/api/admin/customers/${encodeURIComponent(decoded)}`) });
  if (!data) return <Skeleton className="h-96" />;
  return (
    <>
      <PageHeader back={<Link href="/admin/customers" className="text-sm text-muted">← Customers</Link>} title={data.name} description={`${data.email} · ${data.phone} · ${data.country ?? ""}`} />
      <div className="space-y-6">
        <Panel title={`Bookings (${data.bookings.length})`} bodyClassName="p-0">
          <Table className="rounded-none border-0">
            <thead><tr><th>Booking</th><th>Tour</th><th>Travel</th><th>Status</th><th className="text-right!">Paid / total</th></tr></thead>
            <tbody>
              {data.bookings.map((b) => (
                <tr key={b.reference}>
                  <td><Link href={`/admin/bookings/${b.reference}`} className="font-semibold text-primary">{b.reference}</Link></td>
                  <td>{b.tour}</td>
                  <td>{fmtShortDate(b.travel_date)}</td>
                  <td><BookingStatusBadge status={b.status} /></td>
                  <td className="text-right">{money(b.amount_paid, b.currency)} / {money(b.total, b.currency)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
        <div className="grid gap-6 md:grid-cols-2">
          <Panel title="Account">
            {data.account ? (
              <p className="text-sm">Registered {fmtDateTime(data.account.created_at)} · last login {fmtDateTime(data.account.last_login_at) || "never"}</p>
            ) : (
              <p className="text-sm text-muted">Books as a guest (no account).</p>
            )}
          </Panel>
          <Panel title="Enquiries">
            {data.enquiries.length ? (
              <ul className="space-y-2 text-sm">
                {data.enquiries.map((e) => (
                  <li key={e.id}><Link href="/admin/enquiries" className="font-semibold text-primary">{e.kind.replace("_", " ")}</Link> · {e.status} · {fmtDateTime(e.created_at)}</li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">None.</p>}
          </Panel>
        </div>
      </div>
    </>
  );
}
