import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Container, EmptyState } from "@/components/ui/misc";
import { fmtShortDate } from "@/lib/format";
import { getBlog } from "@/lib/server-api";

export const metadata: Metadata = { title: "Travel stories & tips", description: "Safari planning advice, coast guides and travel tips from the Safiri Nasi team." };

export default async function BlogPage() {
  const blog = await getBlog();
  return (
    <Container className="py-12">
      <p className="font-hand text-xl text-sun-strong dark:text-sun">From the road</p>
      <h1 className="text-4xl font-extrabold text-primary md:text-5xl">Travel stories &amp; tips</h1>
      {blog.items.length ? (
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {blog.items.map((p) => (
            <Link key={p.id} href={`/blog/${p.slug}`} className="group overflow-hidden rounded-3xl border border-border bg-surface">
              <div className="relative aspect-[16/10] bg-surface-3">
                {p.cover_image && <Image src={p.cover_image} alt="" fill sizes="(min-width: 1024px) 33vw, 50vw" className="object-cover transition group-hover:scale-105" />}
              </div>
              <div className="p-5">
                <p className="text-xs text-muted">{fmtShortDate(p.published_at)} · {p.tags.join(", ")}</p>
                <h2 className="mt-1 text-xl leading-snug font-bold group-hover:text-lime-strong dark:group-hover:text-lime">{p.title}</h2>
                <p className="mt-2 line-clamp-3 text-sm text-muted">{p.excerpt}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title="Stories coming soon" className="mt-10" />
      )}
    </Container>
  );
}
