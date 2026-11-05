import { Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { SiteInfo } from "@/lib/types";
import { Container } from "../ui/misc";
import { CurrentYear } from "./current-year";
import { Logo } from "./logo";
import { NewsletterForm } from "./newsletter-form";
import { PaymentLogos } from "./payment-logos";

export function Footer({ site }: { site: SiteInfo }) {
  const s = site.settings;
  const kenya = site.destinations.filter((d) => d.region === "kenya").slice(0, 6);
  const abroad = site.destinations.filter((d) => d.region !== "kenya").slice(0, 5);
  const socials = Object.entries(s.socials ?? {}).filter(([, url]) => url);

  return (
    <footer className="mt-24 bg-forest-deep text-[#e8eedf]">
      <div className="relative overflow-hidden">
        <svg className="absolute -top-px left-0 h-10 w-full text-bg" viewBox="0 0 1440 40" preserveAspectRatio="none" aria-hidden>
          <path fill="currentColor" d="M0 0h1440v8c-240 30-480 30-720 12S240 0 0 24z" />
        </svg>
        <Container className="grid gap-10 pt-20 pb-12 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.4fr]">
          <div>
            <Logo onDark />
            <p className="mt-4 max-w-xs text-sm text-[#c4cfb8]">
              Kenyan-owned tour operator crafting safaris, beach holidays and trips abroad. Book online and pay with
              M-Pesa, Airtel Money or card.
            </p>
            <ul className="mt-5 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-lime" /> <a href={`tel:${s.phone.replace(/\s/g, "")}`}>{s.phone}</a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-lime" /> <a href={`mailto:${s.email}`}>{s.email}</a>
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-lime" /> {s.address}
              </li>
            </ul>
          </div>
          <FooterList
            title="Destinations"
            links={[...kenya.slice(0, 5), ...abroad.slice(0, 3)].map((d) => ({ href: `/destinations/${d.slug}`, label: d.name }))}
          />
          <FooterList
            title="Company"
            links={[
              { href: "/about", label: "About us" },
              { href: "/tours", label: "All tours" },
              { href: "/deals", label: "Deals" },
              { href: "/tailor-made", label: "Tailor-made trips" },
              { href: "/blog", label: "Travel stories" },
              { href: "/faq", label: "FAQs" },
              { href: "/contact", label: "Contact" },
            ]}
          />
          <div>
            <h3 className="font-hand text-2xl text-sun">Deals in your inbox</h3>
            <p className="mt-1 mb-4 text-sm text-[#c4cfb8]">Weekend getaways, flash sales and travel inspiration. No spam.</p>
            <NewsletterForm />
            <div className="mt-6">
              <p className="mb-2 text-xs font-bold tracking-widest text-[#9fb08f] uppercase">We accept</p>
              <PaymentLogos />
            </div>
          </div>
        </Container>
      </div>
      <div className="border-t border-white/10">
        <Container className="flex flex-col gap-3 py-6 text-xs text-[#9fb08f] md:flex-row md:items-center md:justify-between">
          <p className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-lime" />
            {s.licences?.[0] ?? "Licensed tour operator"} · © <CurrentYear /> {s.company_name}
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/booking-policy">Booking policy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/credits">Photo credits</Link>
            {socials.map(([name, url]) => (
              <a key={name} href={url} target="_blank" rel="noreferrer" className="capitalize">
                {name}
              </a>
            ))}
          </div>
        </Container>
      </div>
    </footer>
  );
}

function FooterList({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h3 className="mb-4 text-sm font-bold tracking-widest text-[#9fb08f] uppercase">{title}</h3>
      <ul className="space-y-2.5 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="hover:text-lime">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
