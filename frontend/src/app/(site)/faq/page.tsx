import { ChevronDown } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/misc";
import { getFaqs } from "@/lib/server-api";

export const metadata: Metadata = { title: "FAQs", description: "Answers about booking, deposits, M-Pesa payments, resident rates, visas and packing." };

export default async function FaqPage() {
  const faqs = await getFaqs();
  const groups = [...new Set(faqs.map((f) => f.category))];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
  };
  return (
    <Container className="max-w-3xl py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1 className="text-4xl font-extrabold text-primary md:text-5xl">Frequently asked questions</h1>
      <p className="mt-2 text-muted">
        Can&apos;t find what you need? <Link href="/contact" className="font-semibold text-primary underline">Contact us</Link>.
      </p>
      {groups.map((g) => (
        <section key={g} className="mt-10">
          <h2 className="mb-3 text-xl font-bold">{g}</h2>
          <div className="divide-y divide-border rounded-3xl border border-border bg-surface">
            {faqs.filter((f) => f.category === g).map((f) => (
              <details key={f.id} className="group p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
                  {f.question}
                  <ChevronDown className="h-5 w-5 shrink-0 transition group-open:rotate-180" />
                </summary>
                <p className="mt-2 text-muted">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
    </Container>
  );
}
