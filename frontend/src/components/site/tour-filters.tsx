"use client";

import { addMonths, format } from "date-fns";
import { SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { REGION_LABELS } from "@/lib/format";
import type { SiteInfo } from "@/lib/types";
import { useClientValue } from "@/lib/use-client-value";
import { cn } from "@/lib/utils";
import { Select } from "../ui/field";

export const DURATIONS = [
  { value: "1-1", label: "Day trips" },
  { value: "2-3", label: "2–3 days" },
  { value: "4-6", label: "4–6 days" },
  { value: "7-60", label: "7+ days" },
];

export const BUDGETS = [
  { value: "0-15000", label: "Under KES 15,000" },
  { value: "15000-50000", label: "KES 15,000 – 50,000" },
  { value: "50000-100000", label: "KES 50,000 – 100,000" },
  { value: "100000-10000000", label: "KES 100,000+" },
];

const SORTS = [
  { value: "popular", label: "Most popular" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "departure", label: "Next departure" },
  { value: "duration", label: "Shortest first" },
  { value: "rating", label: "Top rated" },
];

let months: { value: string; label: string }[] | undefined;
const getMonths = () =>
  (months ??= Array.from({ length: 12 }, (_, i) => {
    const d = addMonths(new Date(), i);
    return { value: format(d, "yyyy-MM"), label: format(d, "MMM yyyy") };
  }));

type Params = Record<string, string | undefined>;

export function TourFilters({
  params,
  categories,
  destinations,
  total,
  children,
}: {
  params: Params;
  categories: SiteInfo["categories"];
  destinations: SiteInfo["destinations"];
  total: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [mobileOpen, setMobileOpen] = useState(false);
  const monthOptions = useClientValue(getMonths, []);

  const update = (key: string, value: string | undefined) => {
    const next = new URLSearchParams();
    Object.entries({ ...params, [key]: value, page: undefined }).forEach(([k, v]) => v && next.set(k, v));
    startTransition(() => router.push(`${pathname}?${next}`, { scroll: false }));
  };

  const active = ["destination", "category", "month", "duration", "budget", "type", "q"].filter((k) => params[k]);

  const controls = (
    <div className="space-y-5">
      <FilterSelect label="Destination" value={params.destination} onChange={(v) => update("destination", v)}>
        <option value="">All destinations</option>
        {(["kenya", "africa", "international"] as const).map((r) => (
          <optgroup key={r} label={REGION_LABELS[r]}>
            {destinations.filter((d) => d.region === r).map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.name}
              </option>
            ))}
          </optgroup>
        ))}
      </FilterSelect>
      <div>
        <p className="mb-2 text-sm font-semibold">Trip style</p>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c.slug}
              onClick={() => update("category", params.category === c.slug ? undefined : c.slug)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition",
                params.category === c.slug
                  ? "border-forest bg-forest text-white dark:border-lime dark:bg-lime dark:text-forest-deep"
                  : "border-border bg-surface hover:border-lime",
              )}
              aria-pressed={params.category === c.slug}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>
      <FilterSelect label="Travel month" value={params.month} onChange={(v) => update("month", v)}>
        <option value="">Any time</option>
        {monthOptions.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </FilterSelect>
      <FilterSelect label="Duration" value={params.duration} onChange={(v) => update("duration", v)}>
        <option value="">Any length</option>
        {DURATIONS.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </FilterSelect>
      <FilterSelect label="Budget (per person)" value={params.budget} onChange={(v) => update("budget", v)}>
        <option value="">Any budget</option>
        {BUDGETS.map((b) => (
          <option key={b.value} value={b.value}>
            {b.label}
          </option>
        ))}
      </FilterSelect>
      <FilterSelect label="Trip type" value={params.type} onChange={(v) => update("type", v)}>
        <option value="">All types</option>
        <option value="scheduled">Group departures</option>
        <option value="private">Private, any date</option>
        <option value="day_trip">Day trips</option>
      </FilterSelect>
    </div>
  );

  return (
    <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
      <aside className="hidden lg:block">
        <div className="sticky top-28 rounded-3xl border border-border bg-surface p-5">{controls}</div>
      </aside>
      <div className={cn("min-w-0 transition", pending && "opacity-60")}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className={cn("text-sm text-muted transition", pending && "opacity-50")} aria-live="polite">
          <b className="text-text">{total}</b> {total === 1 ? "trip" : "trips"} found
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-semibold lg:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" /> Filters {active.length > 0 && `(${active.length})`}
          </button>
          <label className="sr-only" htmlFor="sort">
            Sort by
          </label>
          <Select id="sort" value={params.sort ?? "popular"} onChange={(e) => update("sort", e.target.value)} className="h-10 w-48 rounded-full text-sm">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {active.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {active.map((k) => (
            <button
              key={k}
              onClick={() => update(k, undefined)}
              className="inline-flex items-center gap-1 rounded-full bg-lime/20 px-3 py-1 text-sm font-medium"
            >
              {chipLabel(k, params[k]!, categories, destinations)} <X className="h-3.5 w-3.5" />
            </button>
          ))}
          <button onClick={() => router.push(pathname)} className="text-sm font-semibold text-primary underline">
            Clear all
          </button>
        </div>
      )}
      {children}
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <button className="flex-1 bg-forest-deep/50" onClick={() => setMobileOpen(false)} aria-label="Close filters" />
          <div className="w-[min(360px,90vw)] overflow-y-auto bg-bg p-5">
            <div className="mb-5 flex items-center justify-between">
              <p className="text-lg font-bold">Filters</p>
              <button onClick={() => setMobileOpen(false)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-2" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            {controls}
            <button onClick={() => setMobileOpen(false)} className="mt-6 h-11 w-full rounded-full bg-lime font-bold text-forest-deep">
              Show {total} trips
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value?: string;
  onChange: (v: string | undefined) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      <Select value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
        {children}
      </Select>
    </label>
  );
}

function chipLabel(key: string, value: string, categories: SiteInfo["categories"], destinations: SiteInfo["destinations"]) {
  if (key === "destination") return destinations.find((d) => d.slug === value)?.name ?? value;
  if (key === "category") return categories.find((c) => c.slug === value)?.name ?? value;
  if (key === "duration") return DURATIONS.find((d) => d.value === value)?.label ?? value;
  if (key === "budget") return BUDGETS.find((b) => b.value === value)?.label ?? value;
  if (key === "type") return { scheduled: "Group departures", private: "Private", day_trip: "Day trips" }[value] ?? value;
  if (key === "q") return `“${value}”`;
  return value;
}
