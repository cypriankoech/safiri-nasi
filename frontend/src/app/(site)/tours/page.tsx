import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TourCard } from "@/components/site/tour-card";
import { TourFilters } from "@/components/site/tour-filters";
import { Container, EmptyState, Skeleton } from "@/components/ui/misc";
import { getSite, getTours } from "@/lib/server-api";
import { Compass } from "lucide-react";

export const metadata: Metadata = {
  title: "Tours & safaris",
  description:
    "Browse Maasai Mara safaris, coast holidays, weekend getaways, day trips and international tours. Filter by date, budget and trip style.",
};

const PAGE_SIZE = 12;

function toApiQuery(params: Record<string, string | undefined>) {
  const q = new URLSearchParams({ page_size: String(PAGE_SIZE) });
  const map: Record<string, string> = { destination: "destination", category: "category", month: "month", type: "tour_type", q: "q", sort: "sort", page: "page", region: "region" };
  for (const [k, apiKey] of Object.entries(map)) if (params[k]) q.set(apiKey, params[k]!);
  if (params.duration) {
    const [min, max] = params.duration.split("-");
    q.set("min_days", min);
    q.set("max_days", max);
  }
  if (params.budget) {
    const [min, max] = params.budget.split("-");
    q.set("min_price", min);
    q.set("max_price", max);
  }
  if (params.deals) q.set("deals", "true");
  return q.toString();
}

export default function ToursPage({ searchParams }: PageProps<"/tours">) {
  return (
    <>
      <section className="border-b border-border bg-surface-2/60">
        <Container className="py-12">
          <p className="font-hand text-xl text-sun-strong dark:text-sun">Find your adventure</p>
          <h1 className="text-4xl font-extrabold text-primary md:text-5xl">Tours &amp; safaris</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Group departures, private trips on your dates and easy day trips. Every price is per person sharing, with
            resident and non-resident rates.
          </p>
        </Container>
      </section>
      <Container className="py-10">
        <Suspense fallback={<ResultsSkeleton />}>
          <Results searchParams={searchParams} />
        </Suspense>
      </Container>
    </>
  );
}

async function Results({ searchParams }: { searchParams: PageProps<"/tours">["searchParams"] }) {
  const raw = await searchParams;
  const params = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  ) as Record<string, string | undefined>;
  const [site, tours] = await Promise.all([getSite(), getTours(toApiQuery(params))]);
  const page = Number(params.page ?? 1);
  const pages = Math.ceil(tours.total / PAGE_SIZE);

  const pageHref = (n: number) => {
    const q = new URLSearchParams(Object.entries({ ...params, page: String(n) }).filter(([, v]) => v) as [string, string][]);
    return `/tours?${q}`;
  };

  return (
    <TourFilters params={params} categories={site.categories} destinations={site.destinations} total={tours.total}>
      {tours.items.length ? (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {tours.items.map((t, i) => (
            <TourCard key={t.id} tour={t} priority={i < 3} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<Compass className="h-6 w-6 text-muted" />} title="No trips match those filters">
          Try another month or destination, or{" "}
          <Link href="/tailor-made" className="font-semibold text-primary underline">
            ask us to plan one for you
          </Link>
          .
        </EmptyState>
      )}
      {pages > 1 && (
        <nav className="mt-10 flex justify-center gap-2" aria-label="Pagination">
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={pageHref(n)}
              aria-current={n === page ? "page" : undefined}
              className={
                n === page
                  ? "grid h-10 w-10 place-items-center rounded-full bg-forest font-bold text-white dark:bg-lime dark:text-forest-deep"
                  : "grid h-10 w-10 place-items-center rounded-full border border-border bg-surface hover:border-lime"
              }
            >
              {n}
            </Link>
          ))}
        </nav>
      )}
    </TourFilters>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
      <Skeleton className="hidden h-[520px] lg:block" />
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-96" />
        ))}
      </div>
    </div>
  );
}
