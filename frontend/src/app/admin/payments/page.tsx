"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, RadioTower } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyRow, PageHeader, Pager, Panel, SearchInput, Table, TableSkeleton } from "@/components/admin/ui";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, PaymentStatusBadge } from "@/components/ui/misc";
import { api } from "@/lib/api";
import type { PaymentRow, UnmatchedPayment } from "@/lib/admin-types";
import { fmtDateTime, METHOD_LABELS, money } from "@/lib/format";
import type { Page } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

export default function PaymentsPage() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<"ledger" | "unmatched" | "setup">((sp.get("tab") as "unmatched") ?? "ledger");
  return (
    <>
      <PageHeader
        title="Payments"
        description="Every M-Pesa, Airtel Money, card, Paybill, bank and cash payment."
        actions={
          <ButtonLink href="/api/admin/payments/export.csv" target="_blank" variant="outline" size="sm">
            <Download className="h-4 w-4" /> Export CSV
          </ButtonLink>
        }
      />
      <div className="mb-5 flex gap-1 rounded-full bg-surface-2 p-1 text-sm font-semibold sm:w-fit" role="tablist">
        {(["ledger", "unmatched", "setup"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("flex-1 rounded-full px-4 py-1.5 capitalize", tab === t ? "bg-surface shadow-sm" : "text-muted")}>
            {t === "unmatched" ? "Unmatched Paybill" : t === "setup" ? "Provider setup" : "Ledger"}
          </button>
        ))}
      </div>
      {tab === "ledger" ? <Ledger /> : tab === "unmatched" ? <Unmatched /> : <ProviderSetup />}
    </>
  );
}

function Ledger() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (method) params.set("method", method);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "payments", params.toString()],
    queryFn: () => api<Page<PaymentRow>>(`/api/admin/payments?${params}`),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-3">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Receipt, booking ref, phone or name" className="w-full sm:w-80" />
        <Select value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }} className="h-10 w-44 text-sm" aria-label="Method">
          <option value="">All methods</option>
          {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-10 w-40 text-sm" aria-label="Status">
          <option value="">All statuses</option>
          {["success", "processing", "failed", "refunded", "pending"].map((s) => <option key={s}>{s}</option>)}
        </Select>
      </div>
      {isLoading ? <TableSkeleton /> : (
        <>
          <Table>
            <thead><tr><th>Date</th><th>Booking</th><th>Method</th><th>Receipt</th><th className="text-right!">Amount</th><th>Status</th></tr></thead>
            <tbody>
              {data?.items.length ? data.items.map((p) => (
                <tr key={p.reference}>
                  <td>{fmtDateTime(p.paid_at ?? p.created_at)}<span className="block text-xs text-muted">{p.reference}</span></td>
                  <td><Link href={`/admin/bookings/${p.booking_reference}`} className="font-semibold text-primary">{p.booking_reference}</Link><span className="block text-xs text-muted">{p.contact_name}</span></td>
                  <td>{METHOD_LABELS[p.method]}<span className="block text-xs text-muted">{p.provider}{p.phone ? ` · ${p.phone}` : ""}</span></td>
                  <td className="font-mono text-xs">{p.receipt_number ?? "—"}{p.failure_reason && <span className="block font-sans text-danger">{p.failure_reason}</span>}</td>
                  <td className="text-right font-semibold">{money(p.amount, p.currency)}</td>
                  <td><PaymentStatusBadge status={p.status} /></td>
                </tr>
              )) : <EmptyRow cols={6}>No payments found.</EmptyRow>}
            </tbody>
          </Table>
          <Pager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPage={setPage} />
        </>
      )}
    </>
  );
}

function Unmatched() {
  const client = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "unmatched"], queryFn: () => api<UnmatchedPayment[]>("/api/admin/unmatched-payments") });
  const [assigning, setAssigning] = useState<UnmatchedPayment | null>(null);
  const [ref, setRef] = useState("");
  const assign = useMutation({
    mutationFn: () => api<{ message: string }>(`/api/admin/unmatched-payments/${assigning!.id}/assign`, { body: { booking_reference: ref.trim().toUpperCase() } }),
    onSuccess: (r) => {
      toast.success(r.message);
      setAssigning(null);
      setRef("");
      client.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <>
      <p className="mb-4 max-w-2xl text-sm text-muted">
        Money paid straight to the Paybill/Till with an account number we couldn&apos;t match to a booking. Find the
        booking (use the phone number or name) and assign the payment; the customer gets a receipt automatically.
      </p>
      {isLoading ? <TableSkeleton rows={3} /> : (
        <Table>
          <thead><tr><th>Received</th><th>Receipt</th><th>Payer</th><th>Account entered</th><th className="text-right!">Amount</th><th /></tr></thead>
          <tbody>
            {data?.length ? data.map((u) => (
              <tr key={u.id}>
                <td>{fmtDateTime(u.created_at)}</td>
                <td className="font-mono text-xs">{u.receipt_number}</td>
                <td>{u.payer_name ?? "—"}<span className="block text-xs text-muted">{u.phone}</span></td>
                <td><Badge tone="sun">{u.account_reference || "(blank)"}</Badge></td>
                <td className="text-right font-semibold">{money(u.amount, u.currency)}</td>
                <td className="text-right"><Button size="sm" onClick={() => setAssigning(u)}>Assign</Button></td>
              </tr>
            )) : <EmptyRow cols={6}>Nothing to match. Every Paybill payment found its booking.</EmptyRow>}
          </tbody>
        </Table>
      )}
      <Dialog open={!!assigning} onClose={() => setAssigning(null)} title="Assign payment to booking"
        footer={<><Button variant="ghost" onClick={() => setAssigning(null)}>Cancel</Button><Button loading={assign.isPending} onClick={() => assign.mutate()}>Assign</Button></>}>
        {assigning && <p className="mb-4 text-sm">{money(assigning.amount, assigning.currency)} from {assigning.payer_name ?? assigning.phone} · receipt {assigning.receipt_number}</p>}
        <Field label="Booking reference"><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="SN-XXXXXX" /></Field>
      </Dialog>
    </>
  );
}

type ProviderConfig = {
  mode: string;
  public_api_url: string;
  providers: Record<string, Record<string, string | boolean>>;
};

function ProviderSetup() {
  const { data } = useQuery({ queryKey: ["admin", "payment-config"], queryFn: () => api<ProviderConfig>("/api/admin/payment-config") });
  const register = useMutation({
    mutationFn: () => api<{ message: string }>("/api/admin/payment-config/register-c2b", { method: "POST" }),
    onSuccess: (r) => toast.success(r.message),
    onError: (e) => toast.error(e.message),
  });
  if (!data) return <TableSkeleton rows={3} />;
  const labels: Record<string, string> = { mpesa: "M-Pesa (Safaricom Daraja)", airtel: "Airtel Money (Open API)", card: "Cards (DPO Pay)" };
  return (
    <div className="space-y-4">
      <div className={cn("rounded-2xl p-4 text-sm font-semibold", data.mode === "live" ? "bg-success-bg text-success" : "bg-warning-bg text-warning")}>
        Payments mode: <b className="uppercase">{data.mode}</b>
        {data.mode === "mock" && " · payments are simulated locally. Set PAYMENTS_MODE=sandbox or live in the API's .env when credentials are ready."}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Object.entries(data.providers).map(([key, cfg]) => (
          <Panel key={key} title={labels[key] ?? key} actions={<Badge tone={cfg.configured ? "green" : "red"}>{cfg.configured ? "Configured" : "Not configured"}</Badge>}>
            <dl className="space-y-2 text-xs">
              {Object.entries(cfg).filter(([k]) => k !== "configured").map(([k, v]) => (
                <div key={k}><dt className="text-muted">{k.replace(/_/g, " ")}</dt><dd className="font-mono break-all">{String(v)}</dd></div>
              ))}
            </dl>
            {key === "mpesa" && (
              <Button variant="outline" size="sm" className="mt-4" loading={register.isPending} onClick={() => register.mutate()}>
                <RadioTower className="h-4 w-4" /> Register Paybill URLs
              </Button>
            )}
          </Panel>
        ))}
      </div>
      <p className="text-xs text-muted">Credentials live in the API&apos;s environment variables (see backend/.env.example), never in the database.</p>
    </div>
  );
}
