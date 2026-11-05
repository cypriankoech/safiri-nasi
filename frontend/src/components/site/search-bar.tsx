"use client";

import { addMonths, format } from "date-fns";
import { CalendarDays, MapPin, Search, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { REGION_LABELS } from "@/lib/format";
import type { SiteInfo } from "@/lib/types";
import { useClientValue } from "@/lib/use-client-value";
import { cn } from "@/lib/utils";

type MonthOption = { value: string; label: string };
const NO_MONTHS: MonthOption[] = [];
let monthOptions: MonthOption[] | undefined;
function getMonths() {
  monthOptions ??= Array.from({ length: 12 }, (_, i) => {
    const d = addMonths(new Date(), i);
    return { value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy") };
  });
  return monthOptions;
}

export function SearchBar({
  destinations,
  className,
}: {
  destinations: SiteInfo["destinations"];
  className?: string;
}) {
  const router = useRouter();
  const [destination, setDestination] = useState("");
  const [month, setMonth] = useState("");
  const [travellers, setTravellers] = useState("2");
  const months = useClientValue(getMonths, NO_MONTHS);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (destination) params.set("destination", destination);
    if (month) params.set("month", month);
    if (travellers) params.set("travellers", travellers);
    router.push(`/tours?${params}`);
  };

  const cell = "flex items-center gap-3 rounded-2xl px-4 py-2.5 transition focus-within:bg-surface-2 hover:bg-surface-2";
  const select = "w-full cursor-pointer appearance-none bg-transparent text-[15px] font-semibold text-text focus:outline-none";

  return (
    <form
      onSubmit={submit}
      className={cn(
        "grid gap-1 rounded-3xl border border-border bg-surface p-2 shadow-soft md:grid-cols-[1.3fr_1fr_0.8fr_auto]",
        className,
      )}
      role="search"
    >
      <label className={cell}>
        <MapPin className="h-5 w-5 shrink-0 text-lime-strong" />
        <span className="flex-1">
          <span className="block text-xs font-medium text-muted">Where to?</span>
          <select className={select} value={destination} onChange={(e) => setDestination(e.target.value)}>
            <option value="">Anywhere</option>
            {(["kenya", "africa", "international"] as const).map((region) => (
              <optgroup key={region} label={REGION_LABELS[region]}>
                {destinations
                  .filter((d) => d.region === region)
                  .map((d) => (
                    <option key={d.slug} value={d.slug}>
                      {d.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </span>
      </label>
      <label className={cell}>
        <CalendarDays className="h-5 w-5 shrink-0 text-lime-strong" />
        <span className="flex-1">
          <span className="block text-xs font-medium text-muted">When?</span>
          <select className={select} value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">Any time</option>
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </span>
      </label>
      <label className={cell}>
        <Users className="h-5 w-5 shrink-0 text-lime-strong" />
        <span className="flex-1">
          <span className="block text-xs font-medium text-muted">Travellers</span>
          <select className={select} value={travellers} onChange={(e) => setTravellers(e.target.value)}>
            {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "traveller" : "travellers"}
              </option>
            ))}
          </select>
        </span>
      </label>
      <button
        type="submit"
        className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-lime px-7 font-bold text-forest-deep transition hover:brightness-95"
      >
        <Search className="h-5 w-5" /> Find trips
      </button>
    </form>
  );
}
