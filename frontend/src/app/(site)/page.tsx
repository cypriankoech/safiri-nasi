import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  CreditCard,
  Headset,
  MapPinned,
  Quote,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wallet,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { CategoryIcon } from "@/components/site/category-icon";
import { PaymentLogos } from "@/components/site/payment-logos";
import { SearchBar } from "@/components/site/search-bar";
import { TourCard } from "@/components/site/tour-card";
import { WhatsAppIcon } from "@/components/site/whatsapp-button";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Container, SectionHeading, Stars } from "@/components/ui/misc";
import { dateRange, fmtShortDate } from "@/lib/format";
import {
  getBlog,
  getDestinations,
  getFeaturedReviews,
  getSite,
  getTours,
  getUpcomingDepartures,
} from "@/lib/server-api";
import { whatsappLink } from "@/lib/utils";

export default async function HomePage() {
  const [site, featured, deals, departures, destinations, reviews, blog] = await Promise.all([
    getSite(),
    getTours("featured=true&page_size=6"),
    getTours("deals=true&page_size=3"),
    getUpcomingDepartures(),
    getDestinations("featured=true"),
    getFeaturedReviews(),
    getBlog(),
  ]);
  const s = site.settings;
  const hero = destinations.find((d) => d.slug === "maasai-mara")?.hero_image ?? destinations[0]?.hero_image;

  return (
    <>
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-forest-deep">
        {hero && (
          <Image src={hero} alt="Hot-air balloon over the Maasai Mara" fill preload sizes="100vw" className="-z-10 object-cover opacity-80" />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-forest-deep/70 via-forest-deep/35 to-forest-deep/85" />
        <div className="absolute -top-24 -right-24 -z-10 h-96 w-96 rounded-full bg-sun/40 blur-3xl" aria-hidden />
        <Container className="pt-20 pb-28 md:pt-28 md:pb-36">
          <p className="font-hand text-2xl text-sun md:text-3xl">Karibu, traveller!</p>
          <h1 className="mt-2 max-w-3xl text-4xl leading-[1.05] font-extrabold text-white sm:text-5xl md:text-7xl">
            Safaris, beaches &amp; journeys <span className="text-lime">made easy.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-white/85">
            Hand-picked trips across Kenya, Africa and beyond, run by local experts. Book online in minutes and pay
            your way: M-Pesa, Airtel Money or card.
          </p>
          <SearchBar destinations={site.destinations} className="mt-10 max-w-5xl" />
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/85">
            <span className="flex items-center gap-1.5">
              <Stars rating={s.stats.rating} /> <b className="text-white">{s.stats.rating}/5</b> from our travellers
            </span>
            <span className="flex items-center gap-1.5">
              <BadgeCheck className="h-4 w-4 text-lime" /> {s.stats.travellers.toLocaleString()}+ happy travellers
            </span>
            <span className="flex items-center gap-1.5">
              <Smartphone className="h-4 w-4 text-lime" /> Pay a deposit with M-Pesa
            </span>
          </div>
        </Container>
        <svg className="absolute bottom-0 left-0 h-12 w-full text-bg" viewBox="0 0 1440 48" preserveAspectRatio="none" aria-hidden>
          <path fill="currentColor" d="M0 48h1440V18c-260 34-520 34-760 10S220 0 0 22z" />
        </svg>
      </section>

      {/* Categories */}
      <Container className="-mt-2 py-12">
        <div className="flex snap-x gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-5 md:overflow-visible lg:grid-cols-9">
          {site.categories.map((c) => (
            <Link
              key={c.slug}
              href={`/tours?category=${c.slug}`}
              className="group flex min-w-28 snap-start flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-4 text-center transition hover:-translate-y-0.5 hover:border-lime"
            >
              <span className="grid h-12 w-12 place-items-center rounded-full bg-lime/15 text-lime-strong transition group-hover:bg-lime group-hover:text-forest-deep dark:text-lime">
                <CategoryIcon name={c.icon} className="h-6 w-6" />
              </span>
              <span className="text-sm leading-tight font-semibold">{c.name}</span>
              <span className="text-[11px] text-muted">{c.tour_count} trips</span>
            </Link>
          ))}
        </div>
      </Container>

      {/* Featured tours */}
      <Container className="py-10">
        <SectionHeading
          eyebrow="Traveller favourites"
          title="Trips everyone's talking about"
          subtitle="Our most-booked safaris and getaways, with confirmed departures and transparent pricing."
          action={
            <ButtonLink href="/tours" variant="outline">
              All tours <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          }
        />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.items.map((t, i) => (
            <TourCard key={t.id} tour={t} priority={i < 3} />
          ))}
        </div>
      </Container>

      {/* How it works */}
      <section className="py-16">
        <Container>
          <div className="relative overflow-hidden rounded-[2rem] bg-forest px-6 py-12 text-white md:px-12">
            <div className="absolute -right-16 -bottom-24 h-72 w-72 rounded-full bg-sun/30 blur-2xl" aria-hidden />
            <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:items-center">
              <div>
                <p className="font-hand text-2xl text-sun">Hakuna matata</p>
                <h2 className="text-3xl font-extrabold md:text-4xl">Booking is as easy as 1-2-3</h2>
                <p className="mt-3 text-white/75">
                  No back-and-forth emails. Reserve your seats online, pay a deposit from your phone and get your
                  confirmation instantly.
                </p>
                <PaymentLogos className="mt-6" />
              </div>
              <ol className="grid gap-4 sm:grid-cols-3">
                {[
                  { icon: MapPinned, title: "Pick your trip", text: "Choose a date, your travellers and any extras. Seats are held for 30 minutes." },
                  { icon: Wallet, title: "Pay a deposit", text: "Usually 30%. Pay by M-Pesa, Airtel Money or card. Clear the balance any time before you go." },
                  { icon: CalendarCheck, title: "Pack your bags", text: "Get an instant receipt, an invoice and your travel voucher by email." },
                ].map((step, i) => (
                  <li key={step.title} className="rounded-2xl bg-white/8 p-5 ring-1 ring-white/10">
                    <span className="flex items-center justify-between">
                      <step.icon className="h-7 w-7 text-lime" />
                      <span className="font-display text-4xl font-extrabold text-white/15">{i + 1}</span>
                    </span>
                    <h3 className="mt-3 text-lg font-bold">{step.title}</h3>
                    <p className="mt-1 text-sm text-white/70">{step.text}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </Container>
      </section>

      {/* Upcoming departures */}
      {departures.length > 0 && (
        <Container className="py-10">
          <SectionHeading
            eyebrow="Join a group"
            title="Upcoming departures"
            subtitle="Guaranteed and filling fast: join fellow travellers on our scheduled trips."
          />
          <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4">
            {departures.map(({ departure, tour }) => (
              <Link
                key={departure.id}
                href={`/book/${tour.slug}?departure=${departure.id}`}
                className="group w-72 shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-surface transition hover:border-lime"
              >
                <div className="relative h-32">
                  {tour.hero_image && <Image src={tour.hero_image} alt="" fill sizes="288px" className="object-cover" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-forest-deep/80 to-transparent" />
                  <p className="absolute bottom-2 left-3 text-sm font-bold text-white">
                    {dateRange(departure.start_date, departure.end_date)}
                  </p>
                  {departure.status === "guaranteed" && (
                    <Badge tone="lime" className="absolute top-2 left-2">
                      Guaranteed
                    </Badge>
                  )}
                </div>
                <div className="p-4">
                  <p className="line-clamp-1 font-bold group-hover:text-lime-strong dark:group-hover:text-lime">{tour.title}</p>
                  <p className={departure.seats_left <= 4 ? "mt-1 text-sm font-bold text-maroon" : "mt-1 text-sm text-muted"}>
                    {departure.seats_left} of {departure.capacity} seats left
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                    Reserve seats <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </Container>
      )}

      {/* Destinations */}
      <Container className="py-14">
        <SectionHeading
          eyebrow="Where to next?"
          title="Popular destinations"
          action={
            <ButtonLink href="/destinations" variant="outline">
              All destinations <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          }
        />
        <div className="grid auto-rows-[200px] grid-cols-2 gap-4 md:auto-rows-[230px] md:grid-cols-4">
          {destinations.slice(0, 6).map((d, i) => (
            <Link
              key={d.slug}
              href={`/destinations/${d.slug}`}
              className={`group relative overflow-hidden rounded-3xl bg-surface-3 ${i === 0 ? "col-span-2 row-span-2" : ""} ${i === 3 ? "md:col-span-2" : ""}`}
            >
              {d.hero_image && (
                <Image src={d.hero_image} alt={d.name} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover transition duration-500 group-hover:scale-105" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-forest-deep/85 via-forest-deep/10 to-transparent" />
              <div className="absolute bottom-0 p-5 text-white">
                <p className="text-xs font-semibold tracking-widest text-lime uppercase">{d.country}</p>
                <h3 className={i === 0 ? "text-3xl font-extrabold" : "text-xl font-bold"}>{d.name}</h3>
                {i === 0 && <p className="mt-1 max-w-sm text-sm text-white/80">{d.summary}</p>}
                <p className="mt-1 text-xs text-white/70">{d.tour_count} trips</p>
              </div>
            </Link>
          ))}
        </div>
      </Container>

      {/* Deals */}
      {deals.items.length > 0 && (
        <section className="bg-surface-2/70 py-16">
          <Container>
            <SectionHeading
              eyebrow="Limited offers"
              title="Deals worth packing for"
              action={
                <ButtonLink href="/deals" variant="sun">
                  See all deals <ArrowRight className="h-4 w-4" />
                </ButtonLink>
              }
            />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {deals.items.map((t) => (
                <TourCard key={t.id} tour={t} />
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* Why us */}
      <Container className="py-20">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="font-hand text-2xl text-sun-strong dark:text-sun">Why Safiri Nasi?</p>
            <h2 className="text-3xl font-extrabold text-primary md:text-4xl">Local know-how, honest prices, real people.</h2>
            <p className="mt-4 text-muted">
              &ldquo;Safiri nasi&rdquo; means <em>travel with us</em>. We&apos;re a Kenyan team that has driven these roads,
              slept in these camps and haggled in these markets, so you don&apos;t have to guess.
            </p>
            <dl className="mt-8 grid grid-cols-3 gap-4">
              {[
                { k: `${s.stats.years}+`, v: "years of trips" },
                { k: `${s.stats.travellers.toLocaleString()}+`, v: "travellers" },
                { k: `${s.stats.destinations}+`, v: "destinations" },
              ].map((stat) => (
                <div key={stat.v} className="rounded-2xl bg-surface p-4 ring-1 ring-border">
                  <dt className="font-display text-3xl font-extrabold text-lime-strong dark:text-lime">{stat.k}</dt>
                  <dd className="text-sm text-muted">{stat.v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: ShieldCheck, title: "Licensed & insured", text: "TRA-licensed operator with vetted camps, lodges and drivers." },
              { icon: CreditCard, title: "Pay your way", text: "M-Pesa, Airtel Money, Visa, Mastercard or bank. Instant receipts every time." },
              { icon: Sparkles, title: "Flexible deposits", text: "Secure your seats with a deposit and pay the rest closer to travel." },
              { icon: Headset, title: "24/7 on-trip support", text: "A real person on WhatsApp from the moment you book until you're home." },
            ].map((f) => (
              <div key={f.title} className="rounded-2xl border border-border bg-surface p-6">
                <f.icon className="h-8 w-8 text-sun-strong dark:text-sun" />
                <h3 className="mt-3 text-lg font-bold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </Container>

      {/* Reviews */}
      {reviews.length > 0 && (
        <section className="py-10">
          <Container>
            <SectionHeading eyebrow="Asante sana!" title="What our travellers say" align="center" />
            <div className="grid gap-6 md:grid-cols-3">
              {reviews.slice(0, 6).map((r) => (
                <figure key={r.id} className="flex flex-col rounded-3xl border border-border bg-surface p-6">
                  <Quote className="h-7 w-7 text-lime" aria-hidden />
                  <Stars rating={r.rating} className="mt-3" />
                  {r.title && <p className="mt-2 font-bold">{r.title}</p>}
                  <blockquote className="mt-1 flex-1 text-sm text-muted">&ldquo;{r.body}&rdquo;</blockquote>
                  <figcaption className="mt-4 flex items-center gap-3 border-t border-border pt-4 text-sm">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-sun/20 font-bold text-sun-strong">{r.name[0]}</span>
                    <span>
                      <span className="block font-semibold">{r.name}</span>
                      <span className="text-xs text-muted">
                        {r.country} · {r.tour_slug ? <Link href={`/tours/${r.tour_slug}`} className="underline">{r.tour_title}</Link> : r.travel_month}
                      </span>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* Tailor-made CTA */}
      <Container className="py-16">
        <div className="relative overflow-hidden rounded-[2rem] bg-sun px-6 py-12 md:px-14">
          <div className="absolute -top-20 -right-10 h-72 w-72 rounded-full bg-sun-strong/50" aria-hidden />
          <div className="relative grid gap-8 md:grid-cols-[1.5fr_1fr] md:items-center">
            <div>
              <h2 className="text-3xl font-extrabold text-forest-deep md:text-4xl">Dreaming of something different?</h2>
              <p className="mt-3 max-w-xl text-forest-deep/80">
                Honeymoon, family reunion, team retreat or a once-in-a-lifetime gorilla trek. Tell us what you have in
                mind and we&apos;ll design it around you. Quotes within one working day.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
              <ButtonLink href="/tailor-made" variant="dark" size="lg">
                Plan a tailor-made trip
              </ButtonLink>
              <ButtonLink href={whatsappLink(s.whatsapp, "Hi Safiri Nasi! I'd like a custom trip.")} variant="outline" size="lg" className="border-forest-deep/20 bg-white/70 text-forest-deep">
                <WhatsAppIcon className="h-5 w-5 text-[#25d366]" /> WhatsApp an expert
              </ButtonLink>
            </div>
          </div>
        </div>
      </Container>

      {/* Blog */}
      {blog.items.length > 0 && (
        <Container className="py-10">
          <SectionHeading
            eyebrow="Travel stories"
            title="Tips & inspiration"
            action={
              <ButtonLink href="/blog" variant="outline">
                Read the blog <ArrowRight className="h-4 w-4" />
              </ButtonLink>
            }
          />
          <div className="grid gap-6 md:grid-cols-3">
            {blog.items.slice(0, 3).map((p) => (
              <Link key={p.id} href={`/blog/${p.slug}`} className="group overflow-hidden rounded-3xl border border-border bg-surface">
                <div className="relative aspect-[16/9] bg-surface-3">
                  {p.cover_image && <Image src={p.cover_image} alt="" fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover transition group-hover:scale-105" />}
                </div>
                <div className="p-5">
                  <p className="text-xs text-muted">{fmtShortDate(p.published_at)}</p>
                  <h3 className="mt-1 text-lg leading-snug font-bold group-hover:text-lime-strong dark:group-hover:text-lime">{p.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{p.excerpt}</p>
                </div>
              </Link>
            ))}
          </div>
        </Container>
      )}
    </>
  );
}
