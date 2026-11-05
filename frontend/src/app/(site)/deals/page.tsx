import type { Metadata } from "next";
import { Tag } from "lucide-react";
import { TourCard } from "@/components/site/tour-card";
import { Container, EmptyState } from "@/components/ui/misc";
import { getTours } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Travel deals",
  description: "Limited-time offers on safaris, beach holidays and group trips. Book with a deposit via M-Pesa.",
};

export default async function DealsPage() {
  const deals = await getTours("deals=true&page_size=60&sort=price_asc");
  return (
    <>
      <section className="relative overflow-hidden bg-sun">
        <div className="absolute -top-24 -right-20 h-80 w-80 rounded-full bg-sun-strong/60" aria-hidden />
        <Container className="relative py-14">
          <p className="font-hand text-2xl text-forest-deep/80">Pole pole, prices are low!</p>
          <h1 className="text-4xl font-extrabold text-forest-deep md:text-5xl">Deals &amp; offers</h1>
          <p className="mt-2 max-w-xl text-forest-deep/80">
            Seasonal specials, group departures and coast packages at their best prices. Secure yours with a deposit.
          </p>
        </Container>
      </section>
      <Container className="py-12">
        {deals.items.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {deals.items.map((t) => (
              <TourCard key={t.id} tour={t} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<Tag className="h-6 w-6 text-muted" />} title="No deals right now">
            Subscribe to our newsletter below and we&apos;ll let you know when the next one drops.
          </EmptyState>
        )}
      </Container>
    </>
  );
}
