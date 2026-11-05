import type { Metadata } from "next";
import { Container } from "@/components/ui/misc";
import { getPhotoCredits } from "@/lib/server-api";

export const metadata: Metadata = { title: "Photo credits" };

export default async function CreditsPage() {
  const credits = await getPhotoCredits();
  return (
    <Container className="max-w-3xl py-12">
      <h1 className="text-4xl font-extrabold text-primary">Photo credits</h1>
      <p className="mt-2 text-muted">
        Destination photos are from Wikimedia Commons and used under their Creative Commons licences. Thank you to the
        photographers below.
      </p>
      <ul className="mt-8 divide-y divide-border rounded-3xl border border-border bg-surface text-sm">
        {credits.map((c) => (
          <li key={c.source} className="flex flex-wrap justify-between gap-2 p-4">
            <a href={c.source} target="_blank" rel="noreferrer" className="font-semibold text-primary underline">
              {c.title}
            </a>
            <span className="text-muted">
              {c.artist} · {c.license}
            </span>
          </li>
        ))}
      </ul>
    </Container>
  );
}
