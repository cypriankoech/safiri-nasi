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

export const CATALOG_TAG = "catalog";

export class NotFoundError extends Error {}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: { Accept: "application/json" } });
  if (res.status === 404) throw new NotFoundError(path);
  if (!res.ok) throw new Error(`API ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

/** Public catalogue data: cached for a minute, refreshed on demand via the "catalog" tag. */
async function cached<T>(path: string): Promise<T> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_TAG);
  return get<T>(path);
}

async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    console.error(err);
    return fallback;
  }
}

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

export const getSite = () => safe(cached<SiteInfo>("/api/site"), FALLBACK_SITE);

export const getTours = (query = "") =>
  safe(cached<Page<TourCard>>(`/api/tours${query ? `?${query}` : ""}`), {
    items: [],
    total: 0,
    page: 1,
    page_size: 12,
  });

export const getTour = (slug: string) => cached<TourDetail>(`/api/tours/${encodeURIComponent(slug)}`);

export const getRelatedTours = (slug: string) =>
  safe(cached<TourCard[]>(`/api/tours/${encodeURIComponent(slug)}/related`), []);

export const getTourReviews = (slug: string) =>
  safe(cached<Page<Review>>(`/api/tours/${encodeURIComponent(slug)}/reviews?page_size=6`), {
    items: [],
    total: 0,
    page: 1,
    page_size: 6,
  });

export const getDestinations = (query = "") =>
  safe(cached<Destination[]>(`/api/destinations${query ? `?${query}` : ""}`), []);

export const getDestination = (slug: string) =>
  cached<{ destination: DestinationDetail; tours: TourCard[] }>(`/api/destinations/${encodeURIComponent(slug)}`);

export const getUpcomingDepartures = () =>
  safe(cached<{ departure: Departure; tour: TourCard }[]>("/api/departures/upcoming?limit=8"), []);

export const getFeaturedReviews = () => safe(cached<Review[]>("/api/reviews/featured?limit=6"), []);

export const getFaqs = () => safe(cached<Faq[]>("/api/faqs"), []);

export const getBlog = (page = 1) =>
  safe(cached<Page<BlogCard>>(`/api/blog?page=${page}`), { items: [], total: 0, page: 1, page_size: 9 });

export const getBlogPost = (slug: string) => cached<BlogPost>(`/api/blog/${encodeURIComponent(slug)}`);

export const getPhotoCredits = () => safe(cached<PhotoCredit[]>("/api/photo-credits"), []);
