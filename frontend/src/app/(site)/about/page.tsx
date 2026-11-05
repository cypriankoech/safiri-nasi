import { Compass, HandHeart, Leaf, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/misc";
import { getDestinations, getSite } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "About us",
  description: "Safiri Nasi is a Kenyan tour operator. Our name means 'travel with us' in Swahili.",
};

export default async function AboutPage() {
  const [site, destinations] = await Promise.all([getSite(), getDestinations("featured=true")]);
  const s = site.settings;
  const image = destinations.find((d) => d.slug === "amboseli")?.hero_image ?? destinations[0]?.hero_image;
  return (
    <>
      <Container className="grid gap-12 py-14 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="font-hand text-2xl text-sun-strong dark:text-sun">Safiri nasi = travel with us</p>
          <h1 className="text-4xl font-extrabold text-primary md:text-5xl">A Kenyan travel company with a big heart for the road</h1>
          <p className="mt-5 text-muted">
            We started Safiri Nasi because booking a great trip in Kenya shouldn&apos;t mean a dozen phone calls and a bank
            transfer into the unknown. Today we run scheduled safaris, coast holidays and international trips for
            Kenyans and visitors alike, with honest pricing and the convenience of paying from your phone.
          </p>
          <p className="mt-4 text-muted">
            Our guides grew up near the parks they show you. Our planners have stayed in the camps they recommend. And
            when something goes sideways on the road, there&apos;s a real person on WhatsApp ready to fix it.
          </p>
          <div className="mt-8 flex gap-3">
            <ButtonLink href="/tours">Explore our trips</ButtonLink>
            <ButtonLink href="/contact" variant="outline">Talk to us</ButtonLink>
          </div>
        </div>
        {image && (
          <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem]">
            <Image src={image} alt="Elephants in Amboseli beneath Mount Kilimanjaro" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
          </div>
        )}
      </Container>
      <section className="bg-forest py-16 text-white">
        <Container>
          <h2 className="text-3xl font-extrabold">What we stand for</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-4">
            {[
              { icon: ShieldCheck, title: "Trust", text: `${s.licences?.[0] ?? "Licensed operator"}. Transparent prices, written policies and instant receipts.` },
              { icon: Compass, title: "Local expertise", text: "Kenyan guides and planners who know every road, camp and season." },
              { icon: HandHeart, title: "Real care", text: "24/7 support on WhatsApp from booking until you're home safe." },
              { icon: Leaf, title: "Responsible travel", text: "We work with community-owned camps and conservancies wherever we can." },
            ].map((v) => (
              <div key={v.title} className="rounded-3xl bg-white/8 p-6 ring-1 ring-white/10">
                <v.icon className="h-8 w-8 text-lime" />
                <h3 className="mt-3 text-lg font-bold">{v.title}</h3>
                <p className="mt-1 text-sm text-white/70">{v.text}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
