"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Star, Trash2, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { refreshCatalog } from "@/app/admin/actions";
import { PageHeader, TableSkeleton } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, EmptyState, Stars } from "@/components/ui/misc";
import { api } from "@/lib/api";
import type { AdminReview, TourRow } from "@/lib/admin-types";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function ReviewsPage() {
  const sp = useSearchParams();
  const client = useQueryClient();
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [adding, setAdding] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "reviews", status],
    queryFn: () => api<AdminReview[]>(`/api/admin/reviews${status ? `?status=${status}` : ""}`),
  });
  const done = async () => {
    await refreshCatalog();
    client.invalidateQueries({ queryKey: ["admin", "reviews"] });
  };
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => api(`/api/admin/reviews/${id}`, { method: "PATCH", body }),
    onSuccess: done,
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/admin/reviews/${id}`, { method: "DELETE" }),
    onSuccess: done,
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Reviews" description="Approve traveller reviews before they appear. Star the best ones for the home page." actions={<Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add testimonial</Button>} />
      <div className="mb-4 flex gap-2">
        {["", "pending", "approved", "rejected"].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={cn("rounded-full px-3 py-1.5 text-sm font-semibold capitalize", status === s ? "bg-forest text-white dark:bg-lime dark:text-forest-deep" : "bg-surface-2")}>{s || "All"}</button>
        ))}
      </div>
      {isLoading ? <TableSkeleton /> : !data?.length ? <EmptyState title="No reviews here" /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((r) => (
            <article key={r.id} className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Stars rating={r.rating} />
                  <p className="mt-1 font-bold">{r.title ?? "Untitled"}</p>
                </div>
                <Badge tone={r.status === "approved" ? "green" : r.status === "pending" ? "sun" : "red"}>{r.status}</Badge>
              </div>
              <p className="mt-2 text-sm text-muted">{r.body}</p>
              <p className="mt-3 text-xs text-muted">{r.name} · {r.country} · {r.tour_title ?? "General"} · {fmtDateTime(r.created_at)} {r.verified && "· verified booking"}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {r.status !== "approved" && <Button size="sm" onClick={() => update.mutate({ id: r.id, body: { status: "approved" } })}><Check className="h-4 w-4" /> Approve</Button>}
                {r.status !== "rejected" && <Button size="sm" variant="outline" onClick={() => update.mutate({ id: r.id, body: { status: "rejected" } })}><X className="h-4 w-4" /> Reject</Button>}
                <Button size="sm" variant={r.featured ? "sun" : "outline"} onClick={() => update.mutate({ id: r.id, body: { featured: !r.featured } })}><Star className="h-4 w-4" /> {r.featured ? "Featured" : "Feature"}</Button>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(r.id)} aria-label="Delete review"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </article>
          ))}
        </div>
      )}
      <AddReview open={adding} onClose={() => setAdding(false)} onDone={done} />
    </>
  );
}

function AddReview({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const tours = useQuery({ queryKey: ["admin", "tours"], queryFn: () => api<TourRow[]>("/api/admin/tours"), enabled: open });
  const [f, setF] = useState({ tour_id: "", name: "", country: "", rating: "5", title: "", body: "", travel_month: "", featured: false });
  const save = useMutation({
    mutationFn: () => api("/api/admin/reviews", { body: { ...f, tour_id: Number(f.tour_id) || null, rating: Number(f.rating) } }),
    onSuccess: () => { toast.success("Testimonial added"); onDone(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onClose={onClose} title="Add a testimonial" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Add</Button></>}>
      <p className="mb-4 text-sm text-muted">For reviews received by email, WhatsApp, Google or TripAdvisor.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Country"><Input value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} /></Field>
        <Field label="Tour"><Select value={f.tour_id} onChange={(e) => setF({ ...f, tour_id: e.target.value })}><option value="">General</option>{tours.data?.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</Select></Field>
        <Field label="Rating"><Select value={f.rating} onChange={(e) => setF({ ...f, rating: e.target.value })}>{[5, 4, 3, 2, 1].map((n) => <option key={n}>{n}</option>)}</Select></Field>
        <Field label="Title" className="sm:col-span-2"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Review" className="sm:col-span-2"><Textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <Field label="Travel month"><Input value={f.travel_month} onChange={(e) => setF({ ...f, travel_month: e.target.value })} placeholder="e.g. August 2026" /></Field>
        <Checkbox className="self-end" label="Feature on home page" checked={f.featured} onChange={(e) => setF({ ...f, featured: e.target.checked })} />
      </div>
    </Dialog>
  );
}
