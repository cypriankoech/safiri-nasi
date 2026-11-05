import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Checkout } from "@/components/booking/checkout";
import { Container } from "@/components/ui/misc";
import { getTour, NotFoundError } from "@/lib/server-api";
import type { Currency, RateCategory, TourDetail } from "@/lib/types";

export const metadata: Metadata = { title: "Book your trip", robots: { index: false } };

export default async function BookPage({ params, searchParams }: PageProps<"/book/[slug]">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  let tour: TourDetail;
  try {
    tour = await getTour(slug);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const num = (v: string | string[] | undefined) => (one(v) ? Number(one(v)) : undefined);
  const rate = one(sp.rate);
  const currency = one(sp.currency);

  return (
    <Container className="py-8">
      <Link href={`/tours/${tour.slug}`} className="text-sm text-muted hover:text-text">
        ← Back to {tour.title}
      </Link>
      <h1 className="mt-2 mb-8 text-3xl font-extrabold text-primary md:text-4xl">Book your trip</h1>
      <Checkout
        tour={tour}
        initial={{
          departure: num(sp.departure),
          date: one(sp.date),
          adults: num(sp.adults),
          children: num(sp.children),
          rate: rate === "resident" || rate === "non_resident" ? (rate as RateCategory) : undefined,
          currency: currency === "KES" || currency === "USD" ? (currency as Currency) : undefined,
        }}
      />
    </Container>
  );
}
