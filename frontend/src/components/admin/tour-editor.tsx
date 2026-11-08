"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { refreshCatalog } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { api } from "@/lib/api";
import type { AdminTour } from "@/lib/admin-types";
import type { Category, Destination, ItineraryDay, MapPoint, RateCategory, Currency } from "@/lib/types";
import { cn } from "@/lib/utils";
import { GalleryField, ImageField } from "./image-field";
import { ConfirmDialog, LinesInput, PageHeader, Panel } from "./ui";

type PriceRow = { rate_category: RateCategory; currency: Currency; adult_price: string; child_price: string; single_supplement: string; compare_at_price: string };
type AddOnRow = { id?: number; name: string; description: string; price_kes: string; price_usd: string; per_person: boolean; active: boolean };

const PRICE_SLOTS: { rate_category: RateCategory; currency: Currency; label: string }[] = [
  { rate_category: "resident", currency: "KES", label: "Resident · KES" },
  { rate_category: "resident", currency: "USD", label: "Resident · USD" },
  { rate_category: "non_resident", currency: "USD", label: "Non-resident · USD" },
  { rate_category: "non_resident", currency: "KES", label: "Non-resident · KES" },
];

const num = (v: string) => (v.trim() === "" ? null : Number(v));
const str = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

function blank(): AdminTour {
  return {
    id: 0, title: "", slug: "", summary: "", description: "", destination_id: null, category_ids: [], tour_type: "scheduled",
    duration_days: 3, duration_nights: 2, difficulty: "easy", min_group: 1, max_group: 12, start_location: "Nairobi",
    end_location: "Nairobi", transport: "", accommodation_level: "", hero_image: null, gallery: [], highlights: [],
    inclusions: [], exclusions: [], map_points: [], faqs: [], tags: [], deposit_percent: 30, balance_due_days: 30,
    cancellation_policy: "", status: "draft", featured: false, is_deal: false, deal_label: null, valid_from: null,
    valid_to: null, seo_title: null, seo_description: null, itinerary: [], prices: [], add_ons: [], departures: [],
    destination: null, categories: [], rating_avg: 0, rating_count: 0, from_price: null, resident_from: null,
    non_resident_from: null, next_departure: null, next_departure_seats: null, bookings_count: 0,
  };
}

export function TourEditor({ initial }: { initial?: AdminTour }) {
  const router = useRouter();
  const client = useQueryClient();
  const [t, setT] = useState<AdminTour>(initial ?? blank());
  const [prices, setPrices] = useState<Record<string, PriceRow>>(() =>
    Object.fromEntries(
      PRICE_SLOTS.map((s) => {
        const p = initial?.prices.find((x) => x.rate_category === s.rate_category && x.currency === s.currency);
        return [`${s.rate_category}:${s.currency}`, { rate_category: s.rate_category, currency: s.currency, adult_price: str(p?.adult_price), child_price: str(p?.child_price), single_supplement: str(p?.single_supplement), compare_at_price: str(p?.compare_at_price) }];
      }),
    ),
  );
  const [itinerary, setItinerary] = useState<ItineraryDay[]>(initial?.itinerary ?? []);
  const [addOns, setAddOns] = useState<AddOnRow[]>(
    (initial?.add_ons ?? []).map((a) => ({ id: a.id, name: a.name, description: a.description ?? "", price_kes: str(a.price_kes), price_usd: str(a.price_usd), per_person: a.per_person, active: a.active })),
  );
  const [points, setPoints] = useState<MapPoint[]>(initial?.map_points ?? []);
  const [faqs, setFaqs] = useState(initial?.faqs ?? []);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const destinations = useQuery({ queryKey: ["admin", "destinations"], queryFn: () => api<Destination[]>("/api/admin/destinations") });
  const categories = useQuery({ queryKey: ["admin", "categories"], queryFn: () => api<Category[]>("/api/admin/categories") });
  const set = <K extends keyof AdminTour>(k: K, v: AdminTour[K]) => setT((x) => ({ ...x, [k]: v }));

  const payload = () => ({
    title: t.title,
    slug: t.slug || null,
    summary: t.summary,
    description: t.description,
    destination_id: t.destination_id,
    category_ids: t.category_ids,
    tour_type: t.tour_type,
    duration_days: t.duration_days,
    duration_nights: t.duration_nights,
    difficulty: t.difficulty,
    min_group: t.min_group,
    max_group: t.max_group,
    start_location: t.start_location || null,
    end_location: t.end_location || null,
    transport: t.transport || null,
    accommodation_level: t.accommodation_level || null,
    hero_image: t.hero_image,
    gallery: t.gallery,
    highlights: t.highlights,
    inclusions: t.inclusions,
    exclusions: t.exclusions,
    map_points: points.filter((p) => p.name && !Number.isNaN(p.lat) && !Number.isNaN(p.lng)),
    faqs: faqs.filter((f) => f.question && f.answer),
    tags: t.tags,
    deposit_percent: t.deposit_percent,
    balance_due_days: t.balance_due_days,
    cancellation_policy: t.cancellation_policy || null,
    status: t.status,
    featured: t.featured,
    is_deal: t.is_deal,
    deal_label: t.deal_label || null,
    valid_from: t.valid_from || null,
    valid_to: t.valid_to || null,
    seo_title: t.seo_title || null,
    seo_description: t.seo_description || null,
    itinerary: itinerary.map((d, i) => ({ ...d, day_number: i + 1 })),
    prices: Object.values(prices)
      .filter((p) => p.adult_price.trim() !== "")
      .map((p) => ({ rate_category: p.rate_category, currency: p.currency, adult_price: num(p.adult_price), child_price: num(p.child_price), single_supplement: num(p.single_supplement), compare_at_price: num(p.compare_at_price) })),
    add_ons: addOns.filter((a) => a.name).map((a) => ({ id: a.id ?? null, name: a.name, description: a.description || null, price_kes: num(a.price_kes) ?? 0, price_usd: num(a.price_usd) ?? 0, per_person: a.per_person, active: a.active })),
  });

  const save = useMutation({
    mutationFn: () =>
      initial
        ? api<AdminTour>(`/api/admin/tours/${initial.id}`, { method: "PUT", body: payload() })
        : api<AdminTour>("/api/admin/tours", { body: payload() }),
    onSuccess: async (saved) => {
      await refreshCatalog();
      client.invalidateQueries({ queryKey: ["admin", "tours"] });
      toast.success("Tour saved");
      if (!initial) router.replace(`/admin/tours/${saved.id}`);
      else setT(saved);
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => api<{ message: string }>(`/api/admin/tours/${initial!.id}`, { method: "DELETE" }),
    onSuccess: async (r) => {
      await refreshCatalog();
      toast.success(r.message);
      router.push("/admin/tours");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        back={<Link href="/admin/tours" className="text-sm text-muted">← Tours</Link>}
        title={initial ? t.title || "Edit tour" : "New tour"}
        description={initial ? `${initial.bookings_count} bookings · /tours/${t.slug}` : "Fill in the basics, prices and itinerary, then publish."}
        actions={
          <>
            {initial && t.status === "published" && (
              <a href={`/tours/${t.slug}`} target="_blank" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-sm font-semibold hover:bg-surface-2">
                <ExternalLink className="h-4 w-4" /> View
              </a>
            )}
            {initial && <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" /> Delete</Button>}
            <Button size="sm" loading={save.isPending} disabled={!t.title} onClick={() => save.mutate()}><Save className="h-4 w-4" /> Save</Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <Panel title="Basics">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title" className="sm:col-span-2"><Input value={t.title} onChange={(e) => set("title", e.target.value)} /></Field>
              <Field label="URL slug" hint="Leave blank to generate from the title"><Input value={t.slug} onChange={(e) => set("slug", e.target.value)} /></Field>
              <Field label="Destination">
                <Select value={t.destination_id ?? ""} onChange={(e) => set("destination_id", Number(e.target.value) || null)}>
                  <option value="">—</option>
                  {destinations.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </Field>
              <Field label="Summary" hint="One or two sentences shown on tour cards" className="sm:col-span-2"><Textarea rows={2} value={t.summary} onChange={(e) => set("summary", e.target.value)} className="min-h-0" /></Field>
              <Field label="Description" className="sm:col-span-2"><Textarea rows={6} value={t.description} onChange={(e) => set("description", e.target.value)} /></Field>
            </div>
            <p className="mt-4 mb-2 text-sm font-semibold">Trip styles</p>
            <div className="flex flex-wrap gap-2">
              {categories.data?.map((c) => {
                const on = t.category_ids.includes(c.id);
                return (
                  <button key={c.id} type="button" aria-pressed={on} onClick={() => set("category_ids", on ? t.category_ids.filter((x) => x !== c.id) : [...t.category_ids, c.id])}
                    className={cn("rounded-full border px-3 py-1 text-sm", on ? "border-forest bg-forest text-white dark:border-lime dark:bg-lime dark:text-forest-deep" : "border-border")}>
                    {c.name}
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title="Logistics">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Type">
                <Select value={t.tour_type} onChange={(e) => set("tour_type", e.target.value as AdminTour["tour_type"])}>
                  <option value="scheduled">Scheduled departures</option><option value="private">Private (any date)</option><option value="day_trip">Day trip</option>
                </Select>
              </Field>
              <Field label="Days"><Input type="number" min={1} value={t.duration_days} onChange={(e) => set("duration_days", Number(e.target.value))} /></Field>
              <Field label="Nights"><Input type="number" min={0} value={t.duration_nights} onChange={(e) => set("duration_nights", Number(e.target.value))} /></Field>
              <Field label="Activity level">
                <Select value={t.difficulty} onChange={(e) => set("difficulty", e.target.value as AdminTour["difficulty"])}><option value="easy">Easy</option><option value="moderate">Moderate</option><option value="challenging">Challenging</option></Select>
              </Field>
              <Field label="Min group"><Input type="number" min={1} value={t.min_group} onChange={(e) => set("min_group", Number(e.target.value))} /></Field>
              <Field label="Max per booking"><Input type="number" min={1} value={t.max_group} onChange={(e) => set("max_group", Number(e.target.value))} /></Field>
              <Field label="Starts"><Input value={t.start_location ?? ""} onChange={(e) => set("start_location", e.target.value)} /></Field>
              <Field label="Ends"><Input value={t.end_location ?? ""} onChange={(e) => set("end_location", e.target.value)} /></Field>
              <Field label="Accommodation level"><Input value={t.accommodation_level ?? ""} onChange={(e) => set("accommodation_level", e.target.value)} placeholder="Budget / Mid-range / Luxury" /></Field>
              <Field label="Transport" className="sm:col-span-3"><Input value={t.transport ?? ""} onChange={(e) => set("transport", e.target.value)} /></Field>
            </div>
          </Panel>

          <Panel title="Prices (per person sharing)">
            <p className="mb-3 text-sm text-muted">Fill at least one row. Missing currencies are converted at the exchange rate in Settings.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead><tr className="text-left text-xs text-muted uppercase"><th className="py-2">Rate</th><th>Adult</th><th>Child</th><th>Single supplement</th><th>Was (strike-through)</th></tr></thead>
                <tbody>
                  {PRICE_SLOTS.map((s) => {
                    const key = `${s.rate_category}:${s.currency}`;
                    const row = prices[key];
                    const upd = (field: keyof PriceRow, v: string) => setPrices({ ...prices, [key]: { ...row, [field]: v } });
                    return (
                      <tr key={key}>
                        <td className="py-1.5 pr-3 font-semibold whitespace-nowrap">{s.label}</td>
                        {(["adult_price", "child_price", "single_supplement", "compare_at_price"] as const).map((f) => (
                          <td key={f} className="pr-2"><Input type="number" min={0} value={row[f]} onChange={(e) => upd(f, e.target.value)} className="h-9 text-sm" aria-label={`${s.label} ${f}`} /></td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Deposit %"><Input type="number" min={0} max={100} value={t.deposit_percent} onChange={(e) => set("deposit_percent", Number(e.target.value))} /></Field>
              <Field label="Balance due (days before travel)"><Input type="number" min={0} value={t.balance_due_days} onChange={(e) => set("balance_due_days", Number(e.target.value))} /></Field>
            </div>
          </Panel>

          <Panel title="Day-by-day itinerary" actions={<Button variant="outline" size="sm" onClick={() => setItinerary([...itinerary, { day_number: itinerary.length + 1, title: "", description: "", location: null, accommodation: null, meals: null, image: null }])}><Plus className="h-4 w-4" /> Add day</Button>}>
            <div className="space-y-3">
              {itinerary.map((d, i) => {
                const upd = (patch: Partial<ItineraryDay>) => setItinerary(itinerary.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <div key={i} className="rounded-xl bg-surface-2 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <b className="text-sm">Day {i + 1}</b>
                      <button type="button" onClick={() => setItinerary(itinerary.filter((_, j) => j !== i))} className="text-muted hover:text-danger" aria-label={`Remove day ${i + 1}`}><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input placeholder="Title" aria-label="Day title" value={d.title} onChange={(e) => upd({ title: e.target.value })} className="sm:col-span-2" />
                      <Textarea placeholder="What happens today" aria-label="Day description" rows={3} value={d.description} onChange={(e) => upd({ description: e.target.value })} className="min-h-0 sm:col-span-2" />
                      <Input placeholder="Location" aria-label="Location" value={d.location ?? ""} onChange={(e) => upd({ location: e.target.value || null })} />
                      <Input placeholder="Overnight" aria-label="Accommodation" value={d.accommodation ?? ""} onChange={(e) => upd({ accommodation: e.target.value || null })} />
                      <Input placeholder="Meals (e.g. B, L, D)" aria-label="Meals" value={d.meals ?? ""} onChange={(e) => upd({ meals: e.target.value || null })} />
                    </div>
                  </div>
                );
              })}
              {!itinerary.length && <p className="text-sm text-muted">No days yet.</p>}
            </div>
          </Panel>

          <Panel title="Highlights, inclusions & exclusions">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Highlights (one per line)"><LinesInput value={t.highlights} onChange={(v) => set("highlights", v)} rows={6} /></Field>
              <Field label="Included"><LinesInput value={t.inclusions} onChange={(v) => set("inclusions", v)} rows={6} /></Field>
              <Field label="Not included"><LinesInput value={t.exclusions} onChange={(v) => set("exclusions", v)} rows={6} /></Field>
            </div>
          </Panel>

          <Panel title="Photos">
            <Field label="Cover photo"><ImageField value={t.hero_image} onChange={(v) => set("hero_image", v)} label="cover photo" /></Field>
            <p className="mt-5 mb-2 text-sm font-semibold">Gallery</p>
            <GalleryField value={t.gallery} onChange={(v) => set("gallery", v)} />
          </Panel>

          <Panel title="Optional extras" actions={<Button variant="outline" size="sm" onClick={() => setAddOns([...addOns, { name: "", description: "", price_kes: "", price_usd: "", per_person: true, active: true }])}><Plus className="h-4 w-4" /> Add extra</Button>}>
            <div className="space-y-2">
              {addOns.map((a, i) => {
                const upd = (patch: Partial<AddOnRow>) => setAddOns(addOns.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <div key={i} className="grid items-center gap-2 rounded-xl bg-surface-2 p-3 sm:grid-cols-[2fr_1fr_1fr_auto_auto_auto]">
                    <Input placeholder="Name" aria-label="Extra name" value={a.name} onChange={(e) => upd({ name: e.target.value })} />
                    <Input placeholder="KES" aria-label="Price KES" type="number" value={a.price_kes} onChange={(e) => upd({ price_kes: e.target.value })} />
                    <Input placeholder="USD" aria-label="Price USD" type="number" value={a.price_usd} onChange={(e) => upd({ price_usd: e.target.value })} />
                    <Checkbox label="Per person" checked={a.per_person} onChange={(e) => upd({ per_person: e.target.checked })} />
                    <Checkbox label="Active" checked={a.active} onChange={(e) => upd({ active: e.target.checked })} />
                    <button type="button" onClick={() => setAddOns(addOns.filter((_, j) => j !== i))} className="text-muted hover:text-danger" aria-label="Remove extra"><Trash2 className="h-4 w-4" /></button>
                    <Input placeholder="Short description" aria-label="Extra description" value={a.description} onChange={(e) => upd({ description: e.target.value })} className="sm:col-span-6" />
                  </div>
                );
              })}
              {!addOns.length && <p className="text-sm text-muted">No extras.</p>}
            </div>
          </Panel>

          <Panel title="Route map points" actions={<Button variant="outline" size="sm" onClick={() => setPoints([...points, { name: "", lat: 0, lng: 0, day: points.length + 1 }])}><Plus className="h-4 w-4" /> Add stop</Button>}>
            <p className="mb-3 text-xs text-muted">Tip: right-click a place in Google Maps to copy its latitude and longitude.</p>
            <div className="space-y-2">
              {points.map((p, i) => {
                const upd = (patch: Partial<MapPoint>) => setPoints(points.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_80px_auto]">
                    <Input placeholder="Place" aria-label="Place" value={p.name} onChange={(e) => upd({ name: e.target.value })} />
                    <Input placeholder="Latitude" aria-label="Latitude" type="number" step="any" value={p.lat} onChange={(e) => upd({ lat: Number(e.target.value) })} />
                    <Input placeholder="Longitude" aria-label="Longitude" type="number" step="any" value={p.lng} onChange={(e) => upd({ lng: Number(e.target.value) })} />
                    <Input placeholder="Day" aria-label="Day" type="number" value={p.day ?? ""} onChange={(e) => upd({ day: Number(e.target.value) || undefined })} />
                    <button type="button" onClick={() => setPoints(points.filter((_, j) => j !== i))} className="text-muted hover:text-danger" aria-label="Remove stop"><Trash2 className="h-4 w-4" /></button>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Tour FAQs & policy" actions={<Button variant="outline" size="sm" onClick={() => setFaqs([...faqs, { question: "", answer: "" }])}><Plus className="h-4 w-4" /> Add FAQ</Button>}>
            <div className="space-y-2">
              {faqs.map((f, i) => (
                <div key={i} className="grid gap-2 rounded-xl bg-surface-2 p-3">
                  <div className="flex gap-2">
                    <Input placeholder="Question" aria-label="Question" value={f.question} onChange={(e) => setFaqs(faqs.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} />
                    <button type="button" onClick={() => setFaqs(faqs.filter((_, j) => j !== i))} className="text-muted hover:text-danger" aria-label="Remove FAQ"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <Textarea placeholder="Answer" aria-label="Answer" rows={2} className="min-h-0" value={f.answer} onChange={(e) => setFaqs(faqs.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} />
                </div>
              ))}
            </div>
            <Field label="Cancellation policy" className="mt-4"><Textarea rows={3} value={t.cancellation_policy ?? ""} onChange={(e) => set("cancellation_policy", e.target.value)} /></Field>
          </Panel>
        </div>

        <aside className="space-y-6">
          <div className="sticky top-6 space-y-6">
            <Panel title="Publishing">
              <Field label="Status">
                <Select value={t.status} onChange={(e) => set("status", e.target.value as AdminTour["status"])}>
                  <option value="draft">Draft (hidden)</option><option value="published">Published</option><option value="archived">Archived</option>
                </Select>
              </Field>
              <div className="mt-4 space-y-3">
                <Checkbox label="Feature on the home page" checked={t.featured} onChange={(e) => set("featured", e.target.checked)} />
                <Checkbox label="Show as a deal" checked={t.is_deal} onChange={(e) => set("is_deal", e.target.checked)} />
                {t.is_deal && <Input placeholder="Deal badge, e.g. Save KES 5,000" value={t.deal_label ?? ""} onChange={(e) => set("deal_label", e.target.value)} aria-label="Deal label" />}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Field label="Valid from"><Input type="date" value={t.valid_from ?? ""} onChange={(e) => set("valid_from", e.target.value || null)} /></Field>
                <Field label="Valid to"><Input type="date" value={t.valid_to ?? ""} onChange={(e) => set("valid_to", e.target.value || null)} /></Field>
              </div>
              <Button className="mt-5 w-full" loading={save.isPending} disabled={!t.title} onClick={() => save.mutate()}><Save className="h-4 w-4" /> Save tour</Button>
              {initial && t.tour_type === "scheduled" && (
                <Link href={`/admin/departures?tour=${initial.id}`} className="mt-3 block text-center text-sm font-semibold text-primary">Manage departures →</Link>
              )}
            </Panel>
            <Panel title="Search engines">
              <Field label="SEO title"><Input value={t.seo_title ?? ""} onChange={(e) => set("seo_title", e.target.value)} placeholder={t.title} /></Field>
              <Field label="Meta description" className="mt-3"><Textarea rows={3} value={t.seo_description ?? ""} onChange={(e) => set("seo_description", e.target.value)} placeholder={t.summary} /></Field>
            </Panel>
          </div>
        </aside>
      </div>
      {initial && (
        <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this tour?" danger confirmLabel="Delete" loading={remove.isPending} onConfirm={() => remove.mutate()}>
          <p className="text-sm text-muted">Tours with bookings are archived instead so your records stay intact.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
