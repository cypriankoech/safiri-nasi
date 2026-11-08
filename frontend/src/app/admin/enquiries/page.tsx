"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Phone, Send } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel, SearchInput, TableSkeleton } from "@/components/admin/ui";
import { WhatsAppIcon } from "@/components/site/whatsapp-button";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { Badge, EmptyState } from "@/components/ui/misc";
import { api } from "@/lib/api";
import type { Enquiry } from "@/lib/admin-types";
import { fmtDate, fmtDateTime, money } from "@/lib/format";
import type { User } from "@/lib/types";
import { cn, whatsappLink } from "@/lib/utils";

const STATUSES = ["new", "contacted", "quoted", "won", "lost"] as const;
const TONES = { new: "sun", contacted: "neutral", quoted: "forest", won: "green", lost: "red" } as const;

export default function EnquiriesPage() {
  const sp = useSearchParams();
  const client = useQueryClient();
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  const list = useQuery({ queryKey: ["admin", "enquiries", params.toString()], queryFn: () => api<Enquiry[]>(`/api/admin/enquiries?${params}`) });
  const staff = useQuery({ queryKey: ["admin", "staff"], queryFn: () => api<User[]>("/api/admin/staff") });
  const current = list.data?.find((e) => e.id === selected) ?? list.data?.[0] ?? null;

  const counts = STATUSES.map((s) => ({ s, n: list.data?.filter((e) => e.status === s).length ?? 0 }));
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => api<Enquiry>(`/api/admin/enquiries/${id}`, { method: "PATCH", body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "enquiries"] }),
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Enquiries" description="Tailor-made requests and contact messages. Move each one through your sales pipeline." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setStatus("")} className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", !status ? "bg-forest text-white dark:bg-lime dark:text-forest-deep" : "bg-surface-2")}>All</button>
        {counts.map(({ s, n }) => (
          <button key={s} onClick={() => setStatus(s)} className={cn("rounded-full px-3 py-1.5 text-sm font-semibold capitalize", status === s ? "bg-forest text-white dark:bg-lime dark:text-forest-deep" : "bg-surface-2")}>
            {s} {!status && n > 0 && <span className="opacity-60">{n}</span>}
          </button>
        ))}
        <SearchInput value={q} onChange={setQ} placeholder="Search name, email, message" className="ml-auto w-full sm:w-72" />
      </div>
      {list.isLoading ? <TableSkeleton /> : !list.data?.length ? (
        <EmptyState title="No enquiries here" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <ul className="max-h-[75vh] space-y-2 overflow-y-auto pr-1">
            {list.data.map((e) => (
              <li key={e.id}>
                <button onClick={() => setSelected(e.id)} className={cn("w-full rounded-2xl border p-4 text-left transition", current?.id === e.id ? "border-lime bg-lime/10" : "border-border bg-surface hover:border-lime")}>
                  <div className="flex items-center justify-between gap-2">
                    <b className="truncate">{e.name}</b>
                    <Badge tone={TONES[e.status]}>{e.status}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{e.destinations.join(", ") || e.tour_title || e.message || "—"}</p>
                  <p className="mt-1 text-xs text-muted">{e.kind.replace("_", " ")} · {fmtDateTime(e.created_at)}</p>
                </button>
              </li>
            ))}
          </ul>
          {current && <EnquiryDetail key={current.id} e={current} staff={staff.data ?? []} onUpdate={(body) => update.mutate({ id: current.id, body })} />}
        </div>
      )}
    </>
  );
}

function EnquiryDetail({ e, staff, onUpdate }: { e: Enquiry; staff: User[]; onUpdate: (b: Record<string, unknown>) => void }) {
  const client = useQueryClient();
  const [note, setNote] = useState("");
  const addNote = useMutation({
    mutationFn: () => api<Enquiry>(`/api/admin/enquiries/${e.id}/notes`, { body: { text: note } }),
    onSuccess: () => { setNote(""); client.invalidateQueries({ queryKey: ["admin", "enquiries"] }); },
    onError: (err) => toast.error(err.message),
  });
  return (
    <Panel
      title={e.name}
      actions={
        <div className="flex gap-2">
          <Select value={e.status} onChange={(ev) => onUpdate({ status: ev.target.value })} className="h-9 w-36 text-sm capitalize" aria-label="Status">
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select value={e.assigned_to_id ?? ""} onChange={(ev) => onUpdate({ assigned_to_id: Number(ev.target.value) || null })} className="h-9 w-40 text-sm" aria-label="Assigned to">
            <option value="">Unassigned</option>
            {staff.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </Select>
        </div>
      }
    >
      <div className="flex flex-wrap gap-2">
        <a href={`mailto:${e.email}`} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-sm"><Mail className="h-4 w-4" /> {e.email}</a>
        {e.phone && <a href={`tel:${e.phone}`} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-sm"><Phone className="h-4 w-4" /> {e.phone}</a>}
        {e.phone && <a href={whatsappLink(e.phone, `Hi ${e.name.split(" ")[0]}, this is Safiri Nasi about your trip request.`)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-[#25d366] px-3 py-1.5 text-sm font-semibold text-white"><WhatsAppIcon className="h-4 w-4" /> WhatsApp</a>}
      </div>
      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
        <Item label="Type">{e.kind.replace("_", " ")}</Item>
        <Item label="Destinations">{e.destinations.join(", ") || e.tour_title || "—"}</Item>
        <Item label="Interests">{e.interests.join(", ") || "—"}</Item>
        <Item label="Start">{e.start_date ? fmtDate(e.start_date) : "Flexible"}</Item>
        <Item label="Length">{e.duration_days ? `${e.duration_days} days` : "—"}</Item>
        <Item label="Group">{e.adults} adults, {e.children} children</Item>
        <Item label="Budget pp">{e.budget_per_person ? money(e.budget_per_person, e.budget_currency) : "—"}</Item>
        <Item label="Accommodation">{e.accommodation_level ?? "—"}</Item>
        <Item label="Country">{e.country ?? "—"}</Item>
      </dl>
      {e.message && <p className="mt-5 rounded-2xl bg-surface-2 p-4 text-sm whitespace-pre-line">{e.message}</p>}
      <h3 className="mt-6 mb-2 font-bold">Activity</h3>
      <ul className="space-y-2 text-sm">
        {e.notes.map((n, i) => (
          <li key={i} className="rounded-xl border border-border p-3">
            <p>{n.text}</p>
            <p className="mt-1 text-xs text-muted">{n.by} · {fmtDateTime(n.at)}</p>
          </li>
        ))}
        {!e.notes.length && <li className="text-muted">No notes yet.</li>}
      </ul>
      <div className="mt-3 flex gap-2">
        <Textarea rows={2} className="min-h-0" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Log a call, quote sent, follow-up…" aria-label="New note" />
        <Button size="icon" className="h-auto" disabled={!note.trim()} loading={addNote.isPending} onClick={() => addNote.mutate()} aria-label="Add note"><Send className="h-4 w-4" /></Button>
      </div>
    </Panel>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
