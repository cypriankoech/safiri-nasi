"use client";

import { usePrefs } from "@/components/providers";
import { money } from "@/lib/format";
import type { FromPrice } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Headline "from" price that follows the visitor's KES/USD preference. */
export function FromPriceTag({
  resident,
  nonResident,
  className,
  size = "md",
}: {
  resident: FromPrice | null;
  nonResident: FromPrice | null;
  className?: string;
  size?: "md" | "lg";
}) {
  const { currency } = usePrefs();
  const primary = currency === "USD" ? (nonResident ?? resident) : (resident ?? nonResident);
  const secondary = primary === resident ? nonResident : resident;
  if (!primary) return <span className="text-sm text-muted">Price on request</span>;
  return (
    <div className={cn("leading-tight", className)}>
      <span className="text-xs text-muted">From </span>
      {primary.compare_at && primary.compare_at > primary.amount && (
        <span className="mr-1 text-xs text-muted line-through">{money(primary.compare_at, primary.currency)}</span>
      )}
      <span className={cn("font-display font-extrabold text-primary", size === "lg" ? "text-2xl" : "text-lg")}>
        {money(primary.amount, primary.currency)}
      </span>
      <span className="text-xs text-muted"> pps</span>
      {secondary && (
        <p className="text-[11px] text-muted">
          {secondary.rate_category === "resident" ? "Residents" : "Non-residents"} {money(secondary.amount, secondary.currency)}
        </p>
      )}
    </div>
  );
}
