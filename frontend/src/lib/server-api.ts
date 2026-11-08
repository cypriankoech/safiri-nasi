import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import type {
  BlogCard,
  BlogPost,
  Departure,
  DestinationDetail,
  Destination,
  Faq,
  Page,
  PhotoCredit,
  Review,
  SiteInfo,
  TourCard,
  TourDetail,
} from "./types";

// Server components call the API directly (not through the /api rewrite).
const API_URL = process.env.API_URL_INTERNAL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// `next build` (e.g. inside `docker build`) runs without the API, so nothing is fetched then.
const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";

export const CATALOG_TAG = "catalog";

// Revalidate almost immediately, but keep `expire` at 5 minutes: anything shorter counts as a
// "short-lived" cache, which Next excludes from prerendering and would force a blocking route.
const FALLBACK_LIFE = { stale: 30, revalidate: 1, expire: 300 };

export class NotFoundError extends Error {}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: { Accept: "application/json" } });
  if (res.status === 404) throw new NotFoundError(path);
  if (!res.ok) throw new Error(`API ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

/** Catalogue data with no sensible fallback (a tour, a post…): cached for a minute, 404s propagate. */
async function cached<T>(path: string): Promise<T> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_TAG);
  return get<T>(path);
}

/**
 * Catalogue data that can degrade gracefully. When the API can't be reached (always the case
 * during the build) the fallback is revalidated after a second, so the page is rebuilt with
 * real data on the next request instead of baking in an empty state.
 */
async function cachedOr<T>(path: string, fallback: T): Promise<T> {
  "use cache";
  cacheTag(CATALOG_TAG);
  if (IS_BUILD) {
    cacheLife(FALLBACK_LIFE);
    return fallback;
  }
  try {
    const data = await get<T>(path);
    cacheLife("minutes");
    return data;
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    console.error(err);
    cacheLife(FALLBACK_LIFE);
    return fallback;
  }
}

const emptyPage = <T>(page_size: number): Page<T> => ({ items: [], total: 0, page: 1, page_size });

const FALLBACK_SITE: SiteInfo = {
  settings: {
    company_name: "Safiri Nasi Tour & Travel",
    tagline: "Travel with us. Discover more.",
    email: "hello@safirinasi.co.ke",
    phone: "+254 700 000 000",
    whatsapp: "254700000000",
    address: "Nairobi, Kenya",
    office_hours: "Mon–Sat, 8:00am – 6:00pm EAT",
    socials: {},
    mpesa_paybill: "",
    mpesa_till: "",
    bank_details: {},
    usd_to_kes: 129,
    default_deposit_percent: 30,
    licences: [],
    stats: { years: 5, travellers: 2500, destinations: 40, rating: 4.9 },
    announcement: "",
    payment_methods: { mpesa: true, airtel: true, card: true, paybill: true, bank: true },
  },
  categories: [],
  destinations: [],
};

export const getSite = () => cachedOr<SiteInfo>("/api/site", FALLBACK_SITE);

export const getTours = (query = "") =>
  cachedOr<Page<TourCard>>(`/api/tours${query ? `?${query}` : ""}`, emptyPage<TourCard>(12));

export const getTour = (slug: string) => cached<TourDetail>(`/api/tours/${encodeURIComponent(slug)}`);

export const getRelatedTours = (slug: string) =>
  cachedOr<TourCard[]>(`/api/tours/${encodeURIComponent(slug)}/related`, []);

export const getTourReviews = (slug: string) =>
  cachedOr<Page<Review>>(`/api/tours/${encodeURIComponent(slug)}/reviews?page_size=6`, emptyPage<Review>(6));

export const getDestinations = (query = "") =>
  cachedOr<Destination[]>(`/api/destinations${query ? `?${query}` : ""}`, []);

export const getDestination = (slug: string) =>
  cached<{ destination: DestinationDetail; tours: TourCard[] }>(`/api/destinations/${encodeURIComponent(slug)}`);

export const getUpcomingDepartures = () =>
  cachedOr<{ departure: Departure; tour: TourCard }[]>("/api/departures/upcoming?limit=8", []);

export const getFeaturedReviews = () => cachedOr<Review[]>("/api/reviews/featured?limit=6", []);

export const getFaqs = () => cachedOr<Faq[]>("/api/faqs", []);

export const getBlog = (page = 1) => cachedOr<Page<BlogCard>>(`/api/blog?page=${page}`, emptyPage<BlogCard>(9));

export const getBlogPost = (slug: string) => cached<BlogPost>(`/api/blog/${encodeURIComponent(slug)}`);

export const getPhotoCredits = () => cachedOr<PhotoCredit[]>("/api/photo-credits", []);
