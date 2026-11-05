import { CalendarDays, Clock, MapPin, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { duration, fmtShortDate } from "@/lib/format";
import type { TourCard as TourCardType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge, Stars } from "../ui/misc";
import { FromPriceTag } from "./price";

export function TourCard({ tour, className, priority }: { tour: TourCardType; className?: string; priority?: boolean }) {
  const fewSeats = tour.next_departure_seats !== null && tour.next_departure_seats <= 4;
  return (
    <Link
      href={`/tours/${tour.slug}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-3xl border border-border bg-surface transition hover:-translate-y-1 hover:shadow-soft",
        className,
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-3">
        {tour.hero_image && (
          <Image
            src={tour.hero_image}
            alt={tour.title}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition duration-500 group-hover:scale-105"
            preload={priority}
          />
        )}
        <div className="absolute inset-x-0 top-0 flex flex-wrap gap-1.5 p-3">
          {tour.is_deal && <Badge tone="sun">{tour.deal_label ?? "Deal"}</Badge>}
          {tour.featured && !tour.is_deal && <Badge tone="lime">Bestseller</Badge>}
          {tour.tour_type === "day_trip" && <Badge tone="forest">Day trip</Badge>}
        </div>
        {tour.destination && (
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-forest-deep/75 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
            <MapPin className="h-3.5 w-3.5 text-lime" /> {tour.destination.name}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-1.5 flex items-center gap-2 text-xs text-muted">
          {tour.rating_count > 0 ? (
            <>
              <Stars rating={tour.rating_avg} size={13} />
              <span className="font-semibold text-text">{Number(tour.rating_avg).toFixed(1)}</span>
              <span>({tour.rating_count})</span>
            </>
          ) : (
            <span>New</span>
          )}
        </div>
        <h3 className="text-lg leading-snug font-bold group-hover:text-lime-strong dark:group-hover:text-lime">{tour.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-muted">{tour.summary}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {duration(tour.duration_days, tour.duration_nights)}
          </span>
          {tour.next_departure ? (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" /> Next: {fmtShortDate(tour.next_departure)}
            </span>
          ) : (
            tour.tour_type !== "scheduled" && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" /> Any date
              </span>
            )
          )}
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <FromPriceTag resident={tour.resident_from} nonResident={tour.non_resident_from} />
          {fewSeats && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-maroon">
              <Users className="h-3.5 w-3.5" /> {tour.next_departure_seats} seats left
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
