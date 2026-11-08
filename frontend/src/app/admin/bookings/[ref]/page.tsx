"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Copy, ExternalLink, FileText, Mail, Plus, RefreshCw, Save, Undo2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog, PageHeader, Panel, Table } from "@/components/admin/ui";
import { WhatsAppIcon } from "@/components/site/whatsapp-button";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, BookingStatusBadge, PaymentStatusBadge, Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/api";
import type { AdminBooking, AdminPayment } from "@/lib/admin-types";
import { dateRange, fmtDate, fmtDateTime, METHOD_LABELS, money } from "@/lib/format";
import { whatsappLink } from "@/lib/utils";

export default function AdminBookingPage() {
  const { ref } = useParams<{ ref: string }>();
  const client = useQueryClient();
  const key = ["admin", "booking", ref];
  const { data: b, isLoading } = useQuery({ queryKey: key, queryFn: () => api<AdminBooking>(`/api/admin/bookings/${ref}`) });
  const refresh = (next?: AdminBooking) => {
    if (next) client.setQueryData(key, next);
    else client.invalidateQueries({ queryKey: key });
    client.invalidateQueries({ queryKey: ["admin", "bookings"] });
  };

  const [payOpen, setPayOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundFor, setRefundFor] = useState<AdminPayment | null>(null);
  const [notes, setNotes] = useState<string | null>(null);

  const resend = useMutation({
    mutationFn: () => api<{ message: string }>(`/api/admin/bookings/${ref}/resend`, { method: "POST" }),
    onSuccess: (r) => toast.success(r.message),
    onError: (e) => toast.error(e.message),
  });
  const saveNotes = useMutation({
    mutationFn: () => api<AdminBooking>(`/api/admin/bookings/${ref}`, { method: "PATCH", body: { internal_notes: notes } }),
    onSuccess: (r) => {
      refresh(r);
      setNotes(null);
      toast.success("Notes saved");
    },
    onError: (e) => toast.error(e.message),
  });
  const markComplete = useMutation({
    mutationFn: () => api<AdminBooking>(`/api/admin/bookings/${ref}`, { method: "PATCH", body: { status: "completed" } }),
    onSuccess: (r) => refresh(r),
    onError: (e) => toast.error(e.message),
  });
  const requery = useMutation({
    mutationFn: (p: string) => api<AdminPayment>(`/api/admin/payments/${p}/requery`, { method: "POST" }),
    onSuccess: (p) => {
      toast.success(`Payment is ${p.status}`);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading || !b) return <Skeleton className="h-96" />;

  const copyLink = async () => {
    await navigator.clipboard.writeText(b.manage_url);
    toast.success("Customer payment link copied");
  };
  const shareText = `Hi ${b.contact_name.split(" ")[0]}, here is your Safiri Nasi booking ${b.reference} for ${b.tour.title}. View and pay securely here: ${b.manage_url}`;
  const closed = ["cancelled", "refunded"].includes(b.status);

  return (
    <>
      <PageHeader
        back={<Link href="/admin/bookings" className="text-sm text-muted hover:text-text">← Bookings</Link>}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {b.reference} <BookingStatusBadge status={b.status} />
          </span>
        }
        description={`${b.tour.title} · created ${fmtDateTime(b.created_at)} via ${b.source}`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={copyLink}><Copy className="h-4 w-4" /> Payment link</Button>
            <a href={whatsappLink(b.contact_phone, shareText)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-sm font-semibold hover:bg-surface-2">
              <WhatsAppIcon className="h-4 w-4 text-[#25d366]" /> WhatsApp
            </a>
            <Button variant="outline" size="sm" loading={resend.isPending} onClick={() => resend.mutate()}><Mail className="h-4 w-4" /> Resend email</Button>
            {!closed && <Button variant="danger" size="sm" onClick={() => setCancelOpen(true)}><Ban className="h-4 w-4" /> Cancel</Button>}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <Panel title="Trip">
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <Info label="Tour"><Link href={`/tours/${b.tour.slug}`} target="_blank" className="font-semibold text-primary">{b.tour.title} <ExternalLink className="inline h-3 w-3" /></Link></Info>
              <Info label="Dates">{dateRange(b.travel_date, b.end_date)}</Info>
              <Info label="Travellers">{b.adults} adults, {b.children} children</Info>
              <Info label="Rate">{b.rate_category === "resident" ? "Resident" : "Non-resident"} · {b.currency}</Info>
              <Info label="Payment plan">{b.payment_plan === "deposit" ? `Deposit ${money(b.deposit_amount, b.currency)}` : "Pay in full"}</Info>
              <Info label="Balance due">{b.balance > 0 ? fmtDate(b.balance_due_date) : "Paid"}</Info>
              {b.departure_status && <Info label="Departure status"><Badge>{b.departure_status}</Badge></Info>}
              {b.promo_code && <Info label="Promo">{b.promo_code}</Info>}
              {b.cancellation_reason && <Info label="Cancelled">{b.cancellation_reason} ({fmtDateTime(b.cancelled_at)})</Info>}
            </dl>
            {b.special_requests && <p className="mt-4 rounded-xl bg-sun/15 p-3 text-sm"><b>Special requests:</b> {b.special_requests}</p>}
          </Panel>

          <Panel title="Payments" actions={!closed && <Button size="sm" onClick={() => setPayOpen(true)}><Plus className="h-4 w-4" /> Record payment</Button>} bodyClassName="p-0">
            <Table className="rounded-none border-0">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Receipt</th>
                  <th className="text-right!">Amount</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {b.payments.length ? b.payments.map((p) => (
                  <tr key={p.reference}>
                    <td>{fmtDateTime(p.paid_at ?? p.created_at)}<span className="block text-xs text-muted">{p.reference}</span></td>
                    <td>
                      {METHOD_LABELS[p.method]}
                      <span className="block text-xs text-muted">{p.provider}{p.phone ? ` · ${p.phone}` : ""}{p.recorded_by_name ? ` · by ${p.recorded_by_name}` : ""}</span>
                    </td>
                    <td className="font-mono text-xs">{p.receipt_number ?? "—"}{p.failure_reason && <span className="block font-sans text-danger">{p.failure_reason}</span>}</td>
                    <td className="text-right font-semibold">
                      {money(p.amount, p.currency)}
                      {p.currency !== b.currency && <span className="block text-xs font-normal text-muted">= {money(p.booking_amount, b.currency)}</span>}
                    </td>
                    <td><PaymentStatusBadge status={p.status} /></td>
                    <td className="text-right whitespace-nowrap">
                      {p.status === "processing" && (
                        <Button variant="ghost" size="sm" loading={requery.isPending} onClick={() => requery.mutate(p.reference)}><RefreshCw className="h-4 w-4" /> Check</Button>
                      )}
                      {p.status === "success" && (
                        <>
                          <a href={`/api/payments/${p.reference}/receipt.pdf`} target="_blank" className="mr-2 inline-flex text-primary" aria-label="Receipt"><FileText className="h-4 w-4" /></a>
                          <button onClick={() => setRefundFor(p)} className="inline-flex text-muted hover:text-danger" aria-label="Mark refunded"><Undo2 className="h-4 w-4" /></button>
                        </>
                      )}
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className="py-8! text-center text-muted">No payments yet.</td></tr>
                )}
              </tbody>
            </Table>
          </Panel>

          <TravellersPanel booking={b} onSaved={refresh} />
        </div>

        <aside className="space-y-6">
          <Panel title="Money">
            <div className="space-y-1.5 text-sm">
              {b.line_items.map((li) => (
                <div key={li.label} className="flex justify-between gap-2"><span className="text-muted">{li.label} × {li.quantity}</span><span>{money(li.amount, b.currency)}</span></div>
              ))}
              {b.discount > 0 && <div className="flex justify-between text-success"><span>Discount</span><span>−{money(b.discount, b.currency)}</span></div>}
              <div className="flex justify-between border-t border-border pt-2 font-bold"><span>Total</span><span>{money(b.total, b.currency)}</span></div>
              <div className="flex justify-between text-success"><span>Paid</span><span>{money(b.amount_paid, b.currency)}</span></div>
              <div className="flex justify-between text-lg font-extrabold"><span>Balance</span><span className={b.balance > 0 ? "text-maroon" : ""}>{money(b.balance, b.currency)}</span></div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <a href={`/api/bookings/${b.reference}/invoice.pdf`} target="_blank" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-border text-sm font-semibold hover:bg-surface-2"><FileText className="h-4 w-4" /> Invoice</a>
              <a href={`/api/bookings/${b.reference}/voucher.pdf`} target="_blank" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-border text-sm font-semibold hover:bg-surface-2"><FileText className="h-4 w-4" /> Voucher</a>
            </div>
            {b.status === "fully_paid" && (
              <Button variant="outline" size="sm" className="mt-2 w-full" loading={markComplete.isPending} onClick={() => markComplete.mutate()}>Mark trip completed</Button>
            )}
          </Panel>
          <Panel title="Customer">
            <p className="font-semibold">{b.contact_name}</p>
            <p className="text-sm"><a href={`mailto:${b.contact_email}`} className="text-primary">{b.contact_email}</a></p>
            <p className="text-sm"><a href={`tel:${b.contact_phone}`}>{b.contact_phone}</a> · {b.contact_country ?? "—"}</p>
            <Link href={`/admin/customers/${encodeURIComponent(b.contact_email)}`} className="mt-2 inline-block text-sm font-semibold text-primary">Customer history →</Link>
          </Panel>
          <Panel title="Internal notes">
            <Textarea value={notes ?? b.internal_notes ?? ""} onChange={(e) => setNotes(e.target.value)} placeholder="Only visible to staff" />
            {notes !== null && (
              <Button size="sm" className="mt-2" loading={saveNotes.isPending} onClick={() => saveNotes.mutate()}><Save className="h-4 w-4" /> Save notes</Button>
            )}
            {b.reminders_sent.length > 0 && <p className="mt-3 text-xs text-muted">Emails sent: {b.reminders_sent.join(", ")}</p>}
          </Panel>
        </aside>
      </div>

      <RecordPaymentDialog open={payOpen} onClose={() => setPayOpen(false)} booking={b} onDone={refresh} />
      <CancelDialog open={cancelOpen} onClose={() => setCancelOpen(false)} reference={b.reference} onDone={refresh} />
      <RefundDialog payment={refundFor} onClose={() => setRefundFor(null)} onDone={refresh} />
    </>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function RecordPaymentDialog({ open, onClose, booking, onDone }: { open: boolean; onClose: () => void; booking: AdminBooking; onDone: (b: AdminBooking) => void }) {
  const [form, setForm] = useState({ method: "paybill", amount: "", currency: "KES", receipt_number: "", paid_at: "", notes: "" });
  const save = useMutation({
    mutationFn: () =>
      api<AdminBooking>(`/api/admin/bookings/${booking.reference}/payments`, {
        body: {
          method: form.method,
          amount: Number(form.amount),
          currency: form.currency,
          receipt_number: form.receipt_number || null,
          paid_at: form.paid_at ? new Date(form.paid_at).toISOString() : null,
          notes: form.notes || null,
        },
      }),
    onSuccess: (b) => {
      toast.success("Payment recorded and receipt emailed");
      onDone(b);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Record a payment"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={!form.amount} onClick={() => save.mutate()}>Save payment</Button></>}
    >
      <p className="mb-4 text-sm text-muted">For money received outside the website: Paybill, bank transfer, cash, or a card/mobile payment taken in person. Balance: {money(booking.balance, booking.currency)}.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Method">
          <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            {(["paybill", "bank", "cash", "mpesa", "airtel", "card"] as const).map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
          </Select>
        </Field>
        <Field label="Amount">
          <div className="flex gap-2">
            <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="w-24" aria-label="Currency"><option>KES</option><option>USD</option></Select>
            <Input type="number" min={0} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
        </Field>
        <Field label="Receipt / reference" hint="M-Pesa code or bank reference">
          <Input value={form.receipt_number} onChange={(e) => setForm({ ...form, receipt_number: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Paid on">
          <Input type="datetime-local" value={form.paid_at} onChange={(e) => setForm({ ...form, paid_at: e.target.value })} />
        </Field>
      </div>
      <Field label="Notes" className="mt-4"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
    </Dialog>
  );
}

function CancelDialog({ open, onClose, reference, onDone }: { open: boolean; onClose: () => void; reference: string; onDone: (b: AdminBooking) => void }) {
  const [reason, setReason] = useState("");
  const cancel = useMutation({
    mutationFn: () => api<AdminBooking>(`/api/admin/bookings/${reference}/cancel`, { body: { reason } }),
    onSuccess: (b) => { toast.success("Booking cancelled and seats released"); onDone(b); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <ConfirmDialog open={open} onClose={onClose} title={`Cancel ${reference}?`} danger confirmLabel="Cancel booking" loading={cancel.isPending} onConfirm={() => reason.length >= 2 ? cancel.mutate() : toast.error("Add a reason")}>
      <p className="mb-3 text-sm text-muted">Seats are released back to the departure. Refunds are processed separately: mark each refunded payment from the payments table.</p>
      <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer request: illness" /></Field>
    </ConfirmDialog>
  );
}

function RefundDialog({ payment, onClose, onDone }: { payment: AdminPayment | null; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const refund = useMutation({
    mutationFn: () => api(`/api/admin/payments/${payment!.reference}/refund`, { body: { notes: note } }),
    onSuccess: () => { toast.success("Payment marked as refunded"); onDone(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <ConfirmDialog open={!!payment} onClose={onClose} title="Mark payment refunded" danger confirmLabel="Mark refunded" loading={refund.isPending} onConfirm={() => note.length >= 2 ? refund.mutate() : toast.error("Add a note")}>
      <p className="mb-3 text-sm text-muted">
        Send the money back from the M-Pesa, Airtel or DPO portal first, then record it here. {payment && <b>{money(payment.amount, payment.currency)} · {payment.receipt_number}</b>}
      </p>
      <Field label="Refund note"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Reversed via M-Pesa B2C, ref QWE123" /></Field>
    </ConfirmDialog>
  );
}

function TravellersPanel({ booking, onSaved }: { booking: AdminBooking; onSaved: (b: AdminBooking) => void }) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(booking.travellers.map(({ full_name, traveller_type, nationality, passport_number, dietary }) => ({
    full_name, traveller_type, nationality: nationality ?? "", passport_number: passport_number ?? "", dietary: dietary ?? "",
  })));
  const save = useMutation({
    mutationFn: () => api<AdminBooking>(`/api/admin/bookings/${booking.reference}`, {
      method: "PATCH",
      body: { travellers: rows.map((r) => ({ ...r, nationality: r.nationality || null, passport_number: r.passport_number || null, dietary: r.dietary || null })) },
    }),
    onSuccess: (b) => { onSaved(b); setEditing(false); toast.success("Travellers updated"); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Panel title={`Travellers (${booking.adults + booking.children})`} actions={!editing ? <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button> : null}>
      {!editing ? (
        <Table className="border-0">
          <thead><tr><th>Name</th><th>Type</th><th>Nationality</th><th>Passport / ID</th><th>Dietary</th></tr></thead>
          <tbody>
            {booking.travellers.map((t) => (
              <tr key={t.id}><td className="font-medium">{t.full_name}{t.is_lead && <span className="text-xs text-muted"> (lead)</span>}</td><td className="capitalize">{t.traveller_type}</td><td>{t.nationality ?? "—"}</td><td>{t.passport_number ?? "—"}</td><td>{t.dietary ?? "—"}</td></tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="grid gap-2 rounded-xl bg-surface-2 p-3 sm:grid-cols-5">
              <Input aria-label="Name" value={r.full_name} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, full_name: e.target.value } : x))} className="sm:col-span-2" />
              <Select aria-label="Type" value={r.traveller_type} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, traveller_type: e.target.value as "adult" | "child" } : x))}><option value="adult">Adult</option><option value="child">Child</option></Select>
              <Input aria-label="Nationality" placeholder="Nationality" value={r.nationality} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, nationality: e.target.value } : x))} />
              <Input aria-label="Passport" placeholder="Passport / ID" value={r.passport_number} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, passport_number: e.target.value } : x))} />
            </div>
          ))}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setRows([...rows, { full_name: "", traveller_type: "adult", nationality: "", passport_number: "", dietary: "" }])}><Plus className="h-4 w-4" /> Add</Button>
            <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>Save travellers</Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
