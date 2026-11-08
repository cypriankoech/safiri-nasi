"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Download, ListChecks, Trash2, Users } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { refreshCatalog } from "@/app/admin/actions";
import { EmptyRow, PageHeader, Table, TableSkeleton } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { api } from "@/lib/api";
import type { DepartureRow, TourRow } from "@/lib/admin-types";
import { dateRange, money } from "@/lib/format";

const STATUS_TONES: Record<string, "green" | "sun" | "red" | "neutral" | "forest"> = {
  open: "neutral",
  guaranteed: "green",
  sold_out: "sun",
  closed: "neutral",
  cancelled: "red",
};

type Manifest = { tour: string; start_date: string; travellers: Record<string, string>[] };

export default function DeparturesPage() {
  const sp = useSearchParams();
  const client = useQueryClient();
  const [tourId, setTourId] = useState(sp.get("tour") ?? "");
  const [includePast, setIncludePast] = useState(false);
  const [adding, setAdding] = useState<"single" | "bulk" | null>(null);
  const [manifestFor, setManifestFor] = useState<DepartureRow | null>(null);

  const tours = useQuery({ queryKey: ["admin", "tours"], queryFn: () => api<TourRow[]>("/api/admin/tours") });
  const params = new URLSearchParams();
  if (tourId) params.set("tour_id", tourId);
  if (includePast) params.set("include_past", "true");
  const key = ["admin", "departures", params.toString()];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => api<DepartureRow[]>(`/api/admin/departures?${params}`) });
  const refresh = async () => {
    await refreshCatalog();
    client.invalidateQueries({ queryKey: ["admin", "departures"] });
  };

  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => api(`/api/admin/departures/${id}`, { method: "PATCH", body }),
    onSuccess: () => { toast.success("Departure updated"); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/admin/departures/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Departure deleted"); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  const scheduled = tours.data?.filter((t) => t.tour_type === "scheduled") ?? [];

  return (
    <>
      <PageHeader
        title="Departures"
        description="Scheduled dates, seats and passenger manifests."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setAdding("bulk")}><ListChecks className="h-4 w-4" /> Add a series</Button>
            <Button size="sm" onClick={() => setAdding("single")}><CalendarPlus className="h-4 w-4" /> Add departure</Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={tourId} onChange={(e) => setTourId(e.target.value)} className="h-10 w-72 text-sm" aria-label="Tour">
          <option value="">All scheduled tours</option>
          {scheduled.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </Select>
        <Checkbox label="Include past" checked={includePast} onChange={(e) => setIncludePast(e.target.checked)} />
      </div>
      {isLoading ? <TableSkeleton /> : (
        <Table>
          <thead><tr><th>Dates</th><th>Tour</th><th>Seats</th><th>Price adj.</th><th>Status</th><th>Collected</th><th /></tr></thead>
          <tbody>
            {data?.length ? data.map((d) => (
              <tr key={d.id}>
                <td className="font-semibold whitespace-nowrap">{dateRange(d.start_date, d.end_date)}</td>
                <td className="max-w-56"><span className="line-clamp-1">{d.tour_title}</span></td>
                <td className="whitespace-nowrap">
                  <span className="font-semibold">{d.seats_booked}</span>/
                  <input
                    type="number"
                    defaultValue={d.capacity}
                    min={d.seats_booked || 1}
                    className="w-14 rounded-lg border border-border bg-surface px-1.5 py-0.5"
                    aria-label="Capacity"
                    onBlur={(e) => Number(e.target.value) !== d.capacity && update.mutate({ id: d.id, body: { capacity: Number(e.target.value) } })}
                  />
                  <span className="block text-xs text-muted">{d.bookings} bookings</span>
                </td>
                <td>
                  <input
                    type="number"
                    defaultValue={d.price_adjustment_percent}
                    className="w-16 rounded-lg border border-border bg-surface px-1.5 py-0.5"
                    aria-label="Price adjustment percent"
                    onBlur={(e) => Number(e.target.value) !== d.price_adjustment_percent && update.mutate({ id: d.id, body: { price_adjustment_percent: Number(e.target.value) } })}
                  />
                  %
                </td>
                <td>
                  <select
                    value={d.status}
                    onChange={(e) => update.mutate({ id: d.id, body: { status: e.target.value } })}
                    className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                    aria-label="Status"
                  >
                    {["open", "guaranteed", "sold_out", "closed", "cancelled"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </select>
                  <Badge tone={STATUS_TONES[d.status]} className="ml-2 hidden xl:inline-flex">{d.seats_left} left</Badge>
                </td>
                <td className="text-xs">{Object.entries(d.revenue).map(([c, v]) => <span key={c} className="block">{money(v, c)}</span>)}</td>
                <td className="text-right whitespace-nowrap">
                  <Button variant="ghost" size="sm" onClick={() => setManifestFor(d)}><Users className="h-4 w-4" /> Manifest</Button>
                  {d.bookings === 0 && (
                    <button onClick={() => remove.mutate(d.id)} className="ml-1 text-muted hover:text-danger" aria-label="Delete departure"><Trash2 className="h-4 w-4" /></button>
                  )}
                </td>
              </tr>
            )) : <EmptyRow cols={7}>No departures. Add dates for your scheduled tours.</EmptyRow>}
          </tbody>
        </Table>
      )}
      <AddDepartureDialog mode={adding} tours={scheduled} defaultTour={tourId} onClose={() => setAdding(null)} onDone={refresh} />
      <ManifestDialog departure={manifestFor} onClose={() => setManifestFor(null)} />
    </>
  );
}

function AddDepartureDialog({ mode, tours, defaultTour, onClose, onDone }: { mode: "single" | "bulk" | null; tours: TourRow[]; defaultTour: string; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ tour_id: defaultTour, start_date: "", last_date: "", every_days: "7", capacity: "12", adj: "0" });
  const save = useMutation({
    mutationFn: () =>
      mode === "bulk"
        ? api<{ message: string }>("/api/admin/departures/bulk", { body: { tour_id: Number(form.tour_id), first_date: form.start_date, last_date: form.last_date, every_days: Number(form.every_days), capacity: Number(form.capacity), price_adjustment_percent: Number(form.adj) } })
        : api("/api/admin/departures", { body: { tour_id: Number(form.tour_id), start_date: form.start_date, capacity: Number(form.capacity), price_adjustment_percent: Number(form.adj) } }),
    onSuccess: (r) => {
      toast.success((r as { message?: string })?.message ?? "Departure added");
      onDone();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={!!mode} onClose={onClose} title={mode === "bulk" ? "Add a series of departures" : "Add a departure"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={!form.tour_id || !form.start_date} onClick={() => save.mutate()}>Add</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tour" className="sm:col-span-2">
          <Select value={form.tour_id} onChange={(e) => setForm({ ...form, tour_id: e.target.value })}>
            <option value="">Choose…</option>
            {tours.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </Select>
        </Field>
        <Field label={mode === "bulk" ? "First departure" : "Start date"}><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
        {mode === "bulk" && (
          <>
            <Field label="Last departure"><Input type="date" value={form.last_date} onChange={(e) => setForm({ ...form, last_date: e.target.value })} /></Field>
            <Field label="Repeat every (days)" hint="7 = weekly, 14 = fortnightly"><Input type="number" min={1} value={form.every_days} onChange={(e) => setForm({ ...form, every_days: e.target.value })} /></Field>
          </>
        )}
        <Field label="Seats"><Input type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></Field>
        <Field label="Price adjustment %" hint="e.g. 15 for peak season"><Input type="number" value={form.adj} onChange={(e) => setForm({ ...form, adj: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

function ManifestDialog({ departure, onClose }: { departure: DepartureRow | null; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["admin", "manifest", departure?.id],
    enabled: !!departure,
    queryFn: () => api<Manifest>(`/api/admin/departures/${departure!.id}/manifest`),
  });
  return (
    <Dialog open={!!departure} onClose={onClose} title={departure ? `Manifest · ${departure.tour_title}` : ""} className="max-w-3xl"
      footer={departure && <a href={`/api/admin/departures/${departure.id}/manifest.csv`} className="inline-flex h-10 items-center gap-2 rounded-full bg-lime px-4 text-sm font-bold text-forest-deep"><Download className="h-4 w-4" /> Download CSV</a>}>
      {departure && <p className="mb-3 text-sm text-muted">{dateRange(departure.start_date, departure.end_date)} · {departure.seats_booked} of {departure.capacity} seats</p>}
      {data?.travellers.length ? (
        <Table>
          <thead><tr><th>Name</th><th>Booking</th><th>Nationality</th><th>Passport</th><th>Phone</th><th>Balance</th></tr></thead>
          <tbody>
            {data.travellers.map((t, i) => (
              <tr key={i}><td className="font-medium">{t.name}</td><td>{t.booking}</td><td>{t.nationality || "—"}</td><td>{t.passport || "—"}</td><td>{t.contact_phone}</td><td>{t.balance}</td></tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <p className="text-sm text-muted">No confirmed travellers yet.</p>
      )}
    </Dialog>
  );
}
