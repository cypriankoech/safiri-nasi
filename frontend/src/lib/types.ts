// Shapes returned by the FastAPI backend (see backend/app/schemas).

export type Currency = "KES" | "USD";
export type RateCategory = "resident" | "non_resident";
export type Region = "kenya" | "africa" | "international";

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface FromPrice {
  amount: number;
  compare_at: number | null;
  currency: Currency;
  rate_category: RateCategory;
}

export interface DestinationRef {
  name: string;
  slug: string;
  region: Region;
  country: string;
}

export interface Destination extends DestinationRef {
  id: number;
  summary: string | null;
  hero_image: string | null;
  featured: boolean;
  latitude: number | null;
  longitude: number | null;
  tour_count: number;
}

export interface DestinationDetail extends Destination {
  description: string | null;
  gallery: string[];
  best_time: string | null;
  highlights: string[];
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  image: string | null;
  tour_count: number;
}

export interface TourCard {
  id: number;
  title: string;
  slug: string;
  summary: string;
  hero_image: string | null;
  duration_days: number;
  duration_nights: number;
  tour_type: "scheduled" | "private" | "day_trip";
  difficulty: "easy" | "moderate" | "challenging";
  accommodation_level: string | null;
  destination: DestinationRef | null;
  categories: { name: string; slug: string }[];
  tags: string[];
  rating_avg: number;
  rating_count: number;
  featured: boolean;
  is_deal: boolean;
  deal_label: string | null;
  valid_to: string | null;
  from_price: FromPrice | null;
  resident_from: FromPrice | null;
  non_resident_from: FromPrice | null;
  next_departure: string | null;
  next_departure_seats: number | null;
}

export interface Departure {
  id: number;
  start_date: string;
  end_date: string;
  capacity: number;
  seats_left: number;
  status: "open" | "guaranteed" | "sold_out" | "closed" | "cancelled";
  price_adjustment_percent: number;
  is_bookable: boolean;
}

export interface ItineraryDay {
  day_number: number;
  title: string;
  description: string;
  location: string | null;
  accommodation: string | null;
  meals: string | null;
  image: string | null;
}

export interface TourPrice {
  rate_category: RateCategory;
  currency: Currency;
  adult_price: number;
  child_price: number | null;
  single_supplement: number | null;
  compare_at_price: number | null;
}

export interface AddOn {
  id: number;
  name: string;
  description: string | null;
  price_kes: number;
  price_usd: number;
  per_person: boolean;
}

export interface MapPoint {
  name: string;
  lat: number;
  lng: number;
  day?: number;
}

export interface TourDetail extends TourCard {
  description: string;
  gallery: string[];
  highlights: string[];
  inclusions: string[];
  exclusions: string[];
  map_points: MapPoint[];
  faqs: { question: string; answer: string }[];
  start_location: string | null;
  end_location: string | null;
  transport: string | null;
  min_group: number;
  max_group: number;
  deposit_percent: number;
  balance_due_days: number;
  cancellation_policy: string | null;
  seo_title: string | null;
  seo_description: string | null;
  valid_from: string | null;
  itinerary: ItineraryDay[];
  prices: TourPrice[];
  departures: Departure[];
  add_ons: AddOn[];
}

export interface Review {
  id: number;
  name: string;
  country: string | null;
  rating: number;
  title: string | null;
  body: string;
  travel_month: string | null;
  verified: boolean;
  created_at: string;
  tour_title?: string | null;
  tour_slug?: string | null;
}

export interface LineItem {
  label: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface Quote {
  tour_id: number;
  departure_id: number | null;
  travel_date: string;
  end_date: string;
  rate_category: RateCategory;
  currency: Currency;
  adults: number;
  children: number;
  line_items: LineItem[];
  subtotal: number;
  discount: number;
  promo_code: string | null;
  promo_message: string | null;
  total: number;
  deposit_percent: number;
  deposit_amount: number;
  payment_plan: "deposit" | "full";
  full_payment_required: boolean;
  balance_due_date: string | null;
}

export type BookingStatus =
  | "pending_payment"
  | "confirmed"
  | "fully_paid"
  | "completed"
  | "cancelled"
  | "expired"
  | "refunded";

export type PaymentMethod = "mpesa" | "airtel" | "card" | "paybill" | "bank" | "cash";
export type PaymentStatus = "pending" | "processing" | "success" | "failed" | "cancelled" | "refunded";

export interface Payment {
  reference: string;
  method: PaymentMethod;
  provider: string;
  amount: number;
  currency: Currency;
  booking_amount: number;
  status: PaymentStatus;
  phone: string | null;
  receipt_number: string | null;
  failure_reason: string | null;
  redirect_url: string | null;
  notes: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface Traveller {
  id: number;
  full_name: string;
  traveller_type: "adult" | "child";
  nationality: string | null;
  passport_number: string | null;
  date_of_birth: string | null;
  dietary: string | null;
  is_lead: boolean;
}

export interface Booking {
  reference: string;
  status: BookingStatus;
  tour: {
    id: number;
    title: string;
    slug: string;
    hero_image: string | null;
    duration_days: number;
    duration_nights: number;
    start_location: string | null;
    transport: string | null;
  };
  departure_id: number | null;
  travel_date: string;
  end_date: string;
  adults: number;
  children: number;
  rate_category: RateCategory;
  currency: Currency;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  contact_country: string | null;
  special_requests: string | null;
  line_items: LineItem[];
  add_ons: LineItem[];
  subtotal: number;
  discount: number;
  promo_code: string | null;
  total: number;
  deposit_amount: number;
  amount_paid: number;
  balance: number;
  amount_due_now: number;
  payment_plan: "deposit" | "full";
  balance_due_date: string | null;
  hold_expires_at: string | null;
  created_at: string;
  confirmed_at: string | null;
  travellers: Traveller[];
  payments: Payment[];
}

export interface PaymentStatusResponse {
  payment: Payment;
  booking_reference: string;
  booking_status: BookingStatus;
  amount_paid?: number;
  balance?: number;
  currency?: Currency;
  access_token?: string;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  country: string | null;
  role: "customer" | "staff" | "admin";
  is_active: boolean;
  created_at: string;
}

export interface SiteSettings {
  company_name: string;
  tagline: string;
  email: string;
  phone: string;
  whatsapp: string;
  address: string;
  office_hours: string;
  socials: Record<string, string>;
  mpesa_paybill: string;
  mpesa_till: string;
  bank_details: Record<string, string>;
  usd_to_kes: number;
  default_deposit_percent: number;
  licences: string[];
  stats: { years: number; travellers: number; destinations: number; rating: number };
  announcement: string;
  payment_methods: Record<string, boolean>;
}

export interface SiteInfo {
  settings: SiteSettings;
  categories: Category[];
  destinations: { name: string; slug: string; region: Region; featured: boolean }[];
}

export interface Faq {
  id: number;
  question: string;
  answer: string;
  category: string;
}

export interface BlogCard {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image: string | null;
  author_name: string | null;
  tags: string[];
  published_at: string | null;
}

export interface BlogPost extends BlogCard {
  body: string;
}

export interface PhotoCredit {
  title: string;
  url: string;
  source: string;
  license: string;
  artist: string;
}
