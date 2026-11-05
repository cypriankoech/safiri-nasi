import { Clock, Heart, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { EnquiryForm } from "@/components/site/enquiry-form";
import { Container } from "@/components/ui/misc";
import { getSite } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Tailor-made trips",
  description: "Tell us your dream trip. Safiri Nasi designs private safaris, honeymoons, family holidays and group travel around you.",
};

export default async function TailorMadePage() {
  const site = await getSite();
  return (
    <Container className="grid gap-12 py-12 lg:grid-cols-[1fr_1.6fr]">
      <div>
        <p className="font-hand text-2xl text-sun-strong dark:text-sun">Your trip, your way</p>
        <h1 className="text-4xl font-extrabold text-primary md:text-5xl">Plan a tailor-made trip</h1>
        <p className="mt-4 text-muted">
          Honeymoon in Zanzibar? A family safari with grandparents? A team retreat by the lake? Share a few details and
          we&apos;ll design an itinerary and quote just for you, with no obligation.
        </p>
        <ul className="mt-8 space-y-5">
          {[
            { icon: Clock, title: "Quote within 1 working day", text: "A real travel expert reads every request." },
            { icon: MessageCircle, title: "We'll refine it together", text: "Tweak dates, lodges and activities until it's perfect." },
            { icon: Heart, title: "Book & pay your way", text: "Secure it with a deposit by M-Pesa, Airtel Money or card." },
          ].map((f) => (
            <li key={f.title} className="flex gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lime/20">
                <f.icon className="h-5 w-5 text-lime-strong" />
              </span>
              <span>
                <b className="block">{f.title}</b>
                <span className="text-sm text-muted">{f.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <EnquiryForm destinations={site.destinations} />
    </Container>
  );
}
