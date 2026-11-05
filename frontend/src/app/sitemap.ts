import type { MetadataRoute } from "next";
import { getBlog, getDestinations, getTours } from "@/lib/server-api";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [tours, destinations, blog] = await Promise.all([getTours("page_size=60"), getDestinations(), getBlog()]);
  const pages = ["", "/tours", "/destinations", "/deals", "/tailor-made", "/about", "/contact", "/faq", "/blog"];
  return [
    ...pages.map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: "weekly" as const, priority: p ? 0.7 : 1 })),
    ...tours.items.map((t) => ({ url: `${SITE_URL}/tours/${t.slug}`, changeFrequency: "weekly" as const, priority: 0.9 })),
    ...destinations.map((d) => ({ url: `${SITE_URL}/destinations/${d.slug}`, priority: 0.8 })),
    ...blog.items.map((b) => ({ url: `${SITE_URL}/blog/${b.slug}`, priority: 0.5 })),
  ];
}
