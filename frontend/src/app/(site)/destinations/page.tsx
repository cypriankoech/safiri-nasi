import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/ui/misc";
import { REGION_LABELS } from "@/lib/format";
import { getDestinations } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Destinations",
  description: "Explore Kenya's parks and beaches, East Africa's highlights and our favourite international getaways.",
};

const INTROS = {
  kenya: "From the Mara's plains to the Swahili coast, the places we know best.",
  africa: "Easy hops across the continent: islands, gorillas and the Serengeti.",
  international: "Holidays further afield, with flights and visas handled for you.",
} as const;

export default async function DestinationsPage() {
  const destinations = await getDestinations();
  return (
    <>
      <section className="border-b border-border bg-surface-2/60">
        <Container className="py-12">
          <p className="font-hand text-xl text-sun-strong dark:text-sun">Where will you go?</p>
          <h1 className="text-4xl font-extrabold text-primary md:text-5xl">Destinations</h1>
        </Container>
      </section>
      <Container className="space-y-16 py-12">
        {(["kenya", "africa", "international"] as const).map((region) => {
          const items = destinations.filter((d) => d.region === region);
          if (!items.length) return null;
          return (
            <section key={region}>
              <h2 className="text-3xl font-extrabold text-primary">{REGION_LABELS[region]}</h2>
              <p className="mb-6 text-muted">{INTROS[region]}</p>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((d) => (
                  <Link key={d.slug} href={`/destinations/${d.slug}`} className="group relative h-72 overflow-hidden rounded-3xl bg-surface-3">
                    {d.hero_image && (
                      <Image src={d.hero_image} alt={d.name} fill sizes="(min-width: 1024px) 33vw, 50vw" className="object-cover transition duration-500 group-hover:scale-105" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-forest-deep/90 via-forest-deep/20 to-transparent" />
                    <div className="absolute bottom-0 p-5 text-white">
                      <p className="text-xs font-semibold tracking-widest text-lime uppercase">{d.country}</p>
                      <h3 className="text-2xl font-extrabold">{d.name}</h3>
                      <p className="mt-1 line-clamp-2 text-sm text-white/80">{d.summary}</p>
                      <p className="mt-2 text-xs font-semibold text-white/70">
                        {d.tour_count ? `${d.tour_count} trip${d.tour_count > 1 ? "s" : ""}` : "Tailor-made on request"}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </Container>
    </>
  );
}
