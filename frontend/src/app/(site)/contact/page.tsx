import { Clock, Mail, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import { EnquiryForm } from "@/components/site/enquiry-form";
import { WhatsAppIcon } from "@/components/site/whatsapp-button";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/misc";
import { getSite } from "@/lib/server-api";
import { whatsappLink } from "@/lib/utils";

export const metadata: Metadata = { title: "Contact us", description: "Call, WhatsApp, email or visit Safiri Nasi Tour & Travel in Nairobi." };

export default async function ContactPage() {
  const site = await getSite();
  const s = site.settings;
  return (
    <Container className="py-12">
      <h1 className="text-4xl font-extrabold text-primary md:text-5xl">Get in touch</h1>
      <p className="mt-2 max-w-xl text-muted">We&apos;re happy to help with bookings, quotes and anything in between.</p>
      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_1.5fr]">
        <div className="space-y-4">
          {[
            { icon: Phone, label: "Call us", value: s.phone, href: `tel:${s.phone.replace(/\s/g, "")}` },
            { icon: Mail, label: "Email", value: s.email, href: `mailto:${s.email}` },
            { icon: MapPin, label: "Office", value: s.address },
            { icon: Clock, label: "Office hours", value: s.office_hours },
          ].map((c) => (
            <div key={c.label} className="flex gap-4 rounded-3xl border border-border bg-surface p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lime/20">
                <c.icon className="h-5 w-5 text-lime-strong" />
              </span>
              <span>
                <span className="block text-sm text-muted">{c.label}</span>
                {c.href ? (
                  <a href={c.href} className="font-semibold hover:underline">
                    {c.value}
                  </a>
                ) : (
                  <b>{c.value}</b>
                )}
              </span>
            </div>
          ))}
          <ButtonLink href={whatsappLink(s.whatsapp, "Hi Safiri Nasi!")} size="lg" className="w-full bg-[#25d366] text-white">
            <WhatsAppIcon className="h-5 w-5" /> Chat on WhatsApp
          </ButtonLink>
        </div>
        <EnquiryForm destinations={site.destinations} kind="contact" />
      </div>
    </Container>
  );
}
