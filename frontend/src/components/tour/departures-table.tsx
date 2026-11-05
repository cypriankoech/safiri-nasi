"use client";

import Link from "next/link";
import { useState } from "react";
import { usePrefs } from "@/components/providers";
import { Badge } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { dateRange, money } from "@/lib/format";
import { adultPrice, hasRate } from "@/lib/pricing";
import type { Departure, TourPrice } from "@/lib/types";

export function DeparturesTable({
  slug,
  departures,
  prices,
  usdToKes,
}: {
  slug: string;
  departures: Departure[];
  prices: TourPrice[];
  usdToKes: number;
}) {
  const { currency, rate } = usePrefs();
  const [showAll, setShowAll] = useState(false);
  const effectiveRate = hasRate(prices, rate) ? rate : prices[0]?.rate_category ?? "resident";
  const list = showAll ? departures : departures.slice(0, 8);

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-left text-xs tracking-wider text-muted uppercase">
          <tr>
            <th className="px-4 py-3 font-semibold">Dates</th>
            <th className="hidden px-4 py-3 font-semibold sm:table-cell">Availability</th>
            <th className="px-4 py-3 text-right font-semibold">Price pp</th>
            <th className="px-4 py-3">
              <span className="sr-only">Book</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map((d) => {
            const price = adultPrice(prices, effectiveRate, currency, usdToKes, d);
            return (
              <tr key={d.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <span className="font-semibold">{dateRange(d.start_date, d.end_date)}</span>
                  <span className="mt-0.5 block text-xs sm:hidden">
                    {d.is_bookable ? `${d.seats_left} seats left` : "Unavailable"}
                  </span>
                  {d.price_adjustment_percent > 0 && <span className="block text-xs text-sun-strong">Peak season</span>}
                </td>
                <td className="hidden px-4 py-3 sm:table-cell">
                  {!d.is_bookable ? (
                    <Badge tone="red">{d.status === "sold_out" || d.seats_left === 0 ? "Sold out" : "Closed"}</Badge>
                  ) : d.status === "guaranteed" ? (
                    <Badge tone="green">Guaranteed · {d.seats_left} left</Badge>
                  ) : d.seats_left <= 4 ? (
                    <Badge tone="sun">Only {d.seats_left} left</Badge>
                  ) : (
                    <span className="text-muted">{d.seats_left} seats available</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-bold">{price !== null ? money(price, currency) : "–"}</td>
                <td className="px-4 py-3 text-right">
                  {d.is_bookable ? (
                    <Link href={`/book/${slug}?departure=${d.id}&rate=${effectiveRate}&currency=${currency}`} className={buttonClass({ size: "sm" })}>
                      Book
                    </Link>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {departures.length > 8 && (
        <button onClick={() => setShowAll(!showAll)} className="w-full border-t border-border py-3 text-sm font-semibold text-primary hover:bg-surface-2">
          {showAll ? "Show fewer dates" : `Show all ${departures.length} departures`}
        </button>
      )}
    </div>
  );
}
