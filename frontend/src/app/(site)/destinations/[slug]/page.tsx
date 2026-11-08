import { CalendarDays, Check } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { TourCard } from "@/components/site/tour-card";
import { VideoReel } from "@/components/site/video-reel";
import { WhatsAppIcon } from "@/components/site/whatsapp-button";
import { ButtonLink } from "@/components/ui/button";
import { Container, EmptyState } from "@/components/ui/misc";
import { TRIP_CLIPS } from "@/lib/media";
import { getDestination, getSite, NotFoundError } from "@/lib/server-api";
import { whatsappLink } from "@/lib/utils";

async function load(slug: string) {
  try {
    return await getDestination(slug);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: PageProps<"/destinations/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  try {
    const { destination } = await getDestination(slug);
    return {
      title: `${destination.name} trips & tours`,
      description: destination.summary ?? undefined,
      openGraph: { images: destination.hero_image ? [destination.hero_image] : [] },
    };
  } catch {
    return { title: "Destination" };
  }
}

export default async function DestinationPage({ params }: PageProps<"/destinations/[slug]">) {
  const { slug } = await params;
  const [{ destination: d, tours }, site] = await Promise.all([load(slug), getSite()]);
  const clips = TRIP_CLIPS.filter((c) => c.destinations.includes(d.slug));
  return (
    <>
      <section className="relative isolate overflow-hidden bg-forest-deep">
        {d.hero_image && <Image src={d.hero_image} alt={d.name} fill preload sizes="100vw" className="-z-10 object-cover opacity-75" />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-forest-deep via-forest-deep/40 to-transparent" />
        <Container className="pt-32 pb-14 text-white">
          <p className="text-sm font-semibold tracking-widest text-lime uppercase">{d.country}</p>
          <h1 className="text-5xl font-extrabold md:text-6xl">{d.name}</h1>
          <p className="mt-3 max-w-2xl text-lg text-white/85">{d.summary}</p>
        </Container>
      </section>
      <Container className="grid gap-10 py-12 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <h2 className="text-2xl font-extrabold text-primary">About {d.name}</h2>
          <p className="mt-3 leading-relaxed text-muted">{d.description}</p>
        </div>
        <div className="space-y-4">
          {d.best_time && (
            <div className="rounded-3xl border border-border bg-surface p-5">
              <p className="flex items-center gap-2 font-bold">
                <CalendarDays className="h-5 w-5 text-sun-strong" /> Best time to visit
              </p>
              <p className="mt-1 text-sm text-muted">{d.best_time}</p>
            </div>
          )}
          {d.highlights.length > 0 && (
            <div className="rounded-3xl border border-border bg-surface p-5">
              <p className="font-bold">Highlights</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {d.highlights.map((h) => (
                  <li key={h} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-lime-strong" /> {h}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Container>
      {d.gallery.length > 0 && (
        <Container className="pb-12">
          <div className="grid auto-rows-[180px] grid-cols-2 gap-3 md:auto-rows-[220px] md:grid-cols-4">
            {d.gallery.slice(0, 6).map((src, i) => (
              <div key={src} className={`relative overflow-hidden rounded-3xl bg-surface-3 ${i === 0 ? "col-span-2 row-span-2" : ""}`}>
                <Image src={src} alt={`${d.name} photo ${i + 1}`} fill sizes={i === 0 ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 768px) 25vw, 50vw"} className="object-cover transition duration-500 hover:scale-105" />
              </div>
            ))}
          </div>
        </Container>
      )}
      {clips.length > 0 && (
        <Container className="pb-12">
          <h2 className="mb-4 text-2xl font-extrabold text-primary">From our last trip to {d.name}</h2>
          <VideoReel clips={clips} />
        </Container>
      )}
      <Container>
        <h2 className="mb-6 text-2xl font-extrabold text-primary">Trips to {d.name}</h2>
        {tours.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {tours.map((t) => (
              <TourCard key={t.id} tour={t} />
            ))}
          </div>
        ) : (
          <EmptyState title={`We'll tailor-make your ${d.name} trip`}>
            <p>Tell us your dates and budget and we&apos;ll put together an itinerary.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/tailor-made">Plan my trip</ButtonLink>
              <ButtonLink href={whatsappLink(site.settings.whatsapp, `Hi! I'd like a trip to ${d.name}.`)} variant="outline">
                <WhatsAppIcon className="h-5 w-5 text-[#25d366]" /> WhatsApp us
              </ButtonLink>
            </div>
          </EmptyState>
        )}
      </Container>
    </>
  );
}
