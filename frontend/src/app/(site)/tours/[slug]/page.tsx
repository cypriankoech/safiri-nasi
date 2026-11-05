import {
  BedDouble,
  Bus,
  Check,
  ChevronDown,
  Clock,
  Flag,
  Gauge,
  MapPin,
  Users,
  Utensils,
  X,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FromPriceTag } from "@/components/site/price";
import { TourCard } from "@/components/site/tour-card";
import { BookingWidget } from "@/components/tour/booking-widget";
import { DeparturesTable } from "@/components/tour/departures-table";
import { Gallery } from "@/components/tour/gallery";
import { ReviewForm } from "@/components/tour/review-form";
import { RouteMapLazy } from "@/components/tour/route-map-lazy";
import { Badge, Container, Stars } from "@/components/ui/misc";
import { DIFFICULTY_LABELS, duration, fmtShortDate, TOUR_TYPE_LABELS } from "@/lib/format";
import { getRelatedTours, getSite, getTour, getTourReviews, NotFoundError } from "@/lib/server-api";
import type { TourDetail } from "@/lib/types";

async function loadTour(slug: string): Promise<TourDetail> {
  try {
    return await getTour(slug);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: PageProps<"/tours/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  try {
    const tour = await getTour(slug);
    return {
      title: tour.seo_title ?? tour.title,
      description: tour.seo_description ?? tour.summary,
      openGraph: { title: tour.title, description: tour.summary, images: tour.hero_image ? [tour.hero_image] : [] },
    };
  } catch {
    return { title: "Tour not found" };
  }
}

export default async function TourPage({ params, searchParams }: PageProps<"/tours/[slug]">) {
  const { slug } = await params;
  const tour = await loadTour(slug);
  const [site, reviews, related] = await Promise.all([getSite(), getTourReviews(slug), getRelatedTours(slug)]);
  const fx = site.settings.usd_to_kes;
  const images = [tour.hero_image, ...tour.gallery].filter(Boolean) as string[];

  const facts = [
    { icon: Clock, label: "Duration", value: duration(tour.duration_days, tour.duration_nights) },
    { icon: Users, label: "Group size", value: `${tour.min_group}–${tour.max_group} travellers` },
    { icon: Gauge, label: "Activity level", value: DIFFICULTY_LABELS[tour.difficulty] },
    { icon: Flag, label: "Starts / ends", value: tour.start_location === tour.end_location || !tour.end_location ? tour.start_location ?? "–" : `${tour.start_location} → ${tour.end_location}` },
    { icon: Bus, label: "Transport", value: tour.transport ?? "–" },
    { icon: BedDouble, label: "Accommodation", value: tour.accommodation_level ?? "–" },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: tour.title,
    description: tour.summary,
    image: images,
    touristType: tour.categories.map((c) => c.name),
    itinerary: {
      "@type": "ItemList",
      itemListElement: tour.itinerary.map((d) => ({ "@type": "ListItem", position: d.day_number, name: d.title })),
    },
    offers: tour.prices.map((p) => ({
      "@type": "Offer",
      price: p.adult_price,
      priceCurrency: p.currency,
      category: p.rate_category,
      availability: "https://schema.org/InStock",
    })),
    ...(tour.rating_count
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: tour.rating_avg, reviewCount: tour.rating_count } }
      : {}),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Container className="pt-6">
        <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-muted" aria-label="Breadcrumb">
          <Link href="/tours" className="hover:text-text">Tours</Link>
          {tour.destination && (
            <>
              <span>/</span>
              <Link href={`/destinations/${tour.destination.slug}`} className="hover:text-text">{tour.destination.name}</Link>
            </>
          )}
          <span>/</span>
          <span className="line-clamp-1 text-text">{tour.title}</span>
        </nav>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <Badge tone="forest">{TOUR_TYPE_LABELS[tour.tour_type]}</Badge>
              {tour.is_deal && <Badge tone="sun">{tour.deal_label ?? "Deal"}</Badge>}
              {tour.categories.map((c) => (
                <Link key={c.slug} href={`/tours?category=${c.slug}`}>
                  <Badge>{c.name}</Badge>
                </Link>
              ))}
            </div>
            <h1 className="max-w-3xl text-3xl font-extrabold text-primary md:text-5xl">{tour.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              {tour.destination && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4 text-lime-strong" /> {tour.destination.name}, {tour.destination.country}
                </span>
              )}
              {tour.rating_count > 0 && (
                <a href="#reviews" className="flex items-center gap-1.5">
                  <Stars rating={tour.rating_avg} /> <b className="text-text">{Number(tour.rating_avg).toFixed(1)}</b> ({tour.rating_count} reviews)
                </a>
              )}
              {tour.valid_to && <span>Offer valid until {fmtShortDate(tour.valid_to)}</span>}
            </div>
          </div>
        </div>
        <Gallery images={images} title={tour.title} />
      </Container>

      <Container className="mt-10 grid gap-10 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-14">
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {facts.map((f) => (
              <div key={f.label} className="rounded-2xl border border-border bg-surface p-4">
                <f.icon className="h-5 w-5 text-lime-strong dark:text-lime" />
                <p className="mt-2 text-xs text-muted">{f.label}</p>
                <p className="text-sm font-semibold">{f.value}</p>
              </div>
            ))}
          </section>

          <section>
            <h2 className="text-2xl font-extrabold text-primary">Overview</h2>
            <p className="mt-3 leading-relaxed whitespace-pre-line text-muted">{tour.description}</p>
            {tour.highlights.length > 0 && (
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {tour.highlights.map((h) => (
                  <li key={h} className="flex gap-3 rounded-2xl bg-lime/10 p-4 text-sm font-medium">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-lime text-forest-deep">
                      <Check className="h-4 w-4" />
                    </span>
                    {h}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {tour.itinerary.length > 0 && (
            <section id="itinerary">
              <h2 className="text-2xl font-extrabold text-primary">Day-by-day itinerary</h2>
              <ol className="relative mt-6 space-y-3 before:absolute before:top-4 before:bottom-4 before:left-[19px] before:w-0.5 before:bg-border">
                {tour.itinerary.map((day, i) => (
                  <li key={day.day_number} className="relative pl-14">
                    <span className="absolute top-3 left-0 grid h-10 w-10 place-items-center rounded-full bg-forest font-display font-bold text-white ring-4 ring-bg dark:bg-lime dark:text-forest-deep">
                      {day.day_number}
                    </span>
                    <details open={i < 2} className="group rounded-2xl border border-border bg-surface">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-bold">
                        <span>
                          <span className="block text-xs font-semibold tracking-wider text-olive uppercase">
                            Day {day.day_number}
                            {day.location ? ` · ${day.location}` : ""}
                          </span>
                          {day.title}
                        </span>
                        <ChevronDown className="h-5 w-5 shrink-0 transition group-open:rotate-180" />
                      </summary>
                      <div className="border-t border-border px-4 pt-3 pb-4 text-sm">
                        <p className="leading-relaxed text-muted">{day.description}</p>
                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                          {day.accommodation && (
                            <span className="flex items-center gap-1.5">
                              <BedDouble className="h-4 w-4 text-lime-strong" /> {day.accommodation}
                            </span>
                          )}
                          {day.meals && day.meals !== "-" && (
                            <span className="flex items-center gap-1.5">
                              <Utensils className="h-4 w-4 text-lime-strong" /> Meals: {day.meals}
                            </span>
                          )}
                        </div>
                      </div>
                    </details>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {tour.map_points.length > 0 && (
            <section>
              <h2 className="mb-4 text-2xl font-extrabold text-primary">Route map</h2>
              <RouteMapLazy points={tour.map_points} />
            </section>
          )}

          <section className="grid gap-6 md:grid-cols-2">
            <div className="rounded-3xl border border-border bg-surface p-6">
              <h2 className="text-xl font-extrabold text-primary">What&apos;s included</h2>
              <ul className="mt-4 space-y-2.5 text-sm">
                {tour.inclusions.map((x) => (
                  <li key={x} className="flex gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {x}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl border border-border bg-surface p-6">
              <h2 className="text-xl font-extrabold text-primary">Not included</h2>
              <ul className="mt-4 space-y-2.5 text-sm">
                {tour.exclusions.map((x) => (
                  <li key={x} className="flex gap-2.5">
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-danger" /> {x}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {tour.tour_type === "scheduled" && (
            <section id="dates">
              <h2 className="mb-1 text-2xl font-extrabold text-primary">Dates &amp; prices</h2>
              <p className="mb-4 text-sm text-muted">
                Prices per person sharing. A {tour.deposit_percent}% deposit secures your seat; the balance is due{" "}
                {tour.balance_due_days} days before departure.
              </p>
              {tour.departures.length ? (
                <DeparturesTable slug={tour.slug} departures={tour.departures} prices={tour.prices} usdToKes={fx} />
              ) : (
                <p className="rounded-2xl bg-surface-2 p-5 text-sm">New dates coming soon. WhatsApp us to request a date.</p>
              )}
            </section>
          )}

          {tour.add_ons.length > 0 && (
            <section>
              <h2 className="text-2xl font-extrabold text-primary">Optional extras</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {tour.add_ons.map((a) => (
                  <div key={a.id} className="rounded-2xl border border-border bg-surface p-4">
                    <p className="font-semibold">{a.name}</p>
                    {a.description && <p className="text-sm text-muted">{a.description}</p>}
                    <p className="mt-2 text-sm font-bold text-primary">
                      KES {Number(a.price_kes).toLocaleString()} / US$ {Number(a.price_usd).toLocaleString()}{" "}
                      <span className="font-normal text-muted">{a.per_person ? "per person" : "per booking"}</span>
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section id="reviews">
            <h2 className="text-2xl font-extrabold text-primary">Traveller reviews</h2>
            <Suspense fallback={null}>
              <ReviewInvite slug={tour.slug} searchParams={searchParams} />
            </Suspense>
            {reviews.items.length ? (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {reviews.items.map((r) => (
                  <article key={r.id} className="rounded-3xl border border-border bg-surface p-5">
                    <div className="flex items-center justify-between">
                      <Stars rating={r.rating} />
                      {r.verified && <Badge tone="green">Verified trip</Badge>}
                    </div>
                    {r.title && <p className="mt-2 font-bold">{r.title}</p>}
                    <p className="mt-1 text-sm text-muted">{r.body}</p>
                    <p className="mt-3 text-xs text-muted">
                      <b className="text-text">{r.name}</b> · {r.country} · {r.travel_month}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-muted">No reviews yet. Be the first to travel and tell us about it!</p>
            )}
          </section>

          {tour.faqs.length > 0 && (
            <section>
              <h2 className="text-2xl font-extrabold text-primary">Good to know</h2>
              <div className="mt-4 divide-y divide-border rounded-3xl border border-border bg-surface">
                {tour.faqs.map((f) => (
                  <details key={f.question} className="group p-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
                      {f.question}
                      <ChevronDown className="h-5 w-5 shrink-0 transition group-open:rotate-180" />
                    </summary>
                    <p className="mt-2 text-sm text-muted">{f.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          )}

          {tour.cancellation_policy && (
            <section className="rounded-3xl bg-surface-2 p-6 text-sm">
              <h2 className="text-lg font-bold">Cancellation &amp; changes</h2>
              <p className="mt-2 text-muted">{tour.cancellation_policy}</p>
              <Link href="/booking-policy" className="mt-2 inline-block font-semibold text-primary underline">
                Full booking policy
              </Link>
            </section>
          )}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-28">
            <BookingWidget tour={tour} usdToKes={fx} whatsapp={site.settings.whatsapp} />
          </div>
        </aside>
      </Container>

      {/* Mobile: booking widget inline plus a sticky bar */}
      <Container className="mt-10 lg:hidden" >
        <div id="book">
          <BookingWidget tour={tour} usdToKes={fx} whatsapp={site.settings.whatsapp} />
        </div>
      </Container>
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-border bg-surface/95 px-4 py-3 pr-20 backdrop-blur lg:hidden">
        <FromPriceTag resident={tour.resident_from} nonResident={tour.non_resident_from} />
        <a href="#book" className="rounded-full bg-lime px-5 py-2.5 text-sm font-bold text-forest-deep">
          Check dates
        </a>
      </div>

      {related.length > 0 && (
        <Container className="mt-20">
          <h2 className="mb-6 text-2xl font-extrabold text-primary">You might also like</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((t) => (
              <TourCard key={t.id} tour={t} />
            ))}
          </div>
        </Container>
      )}
    </>
  );
}

async function ReviewInvite({
  slug,
  searchParams,
}: {
  slug: string;
  searchParams: PageProps<"/tours/[slug]">["searchParams"];
}) {
  const sp = await searchParams;
  const reference = typeof sp.review === "string" ? sp.review : null;
  const token = typeof sp.t === "string" ? sp.t : undefined;
  if (!reference) return null;
  return (
    <div className="mt-5">
      <ReviewForm slug={slug} reference={reference} token={token} />
    </div>
  );
}
