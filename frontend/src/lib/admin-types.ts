import type {
  AddOn,
  Booking,
  BookingStatus,
  Currency,
  Payment,
  PaymentMethod,
  PaymentStatus,
  TourDetail,
} from "./types";

export interface Dashboard {
  fx_usd_kes: number;
  kpis: {
    revenue_this_month: number;
    revenue_last_month: number;
    outstanding_balances: number;
    overdue_balances: number;
    bookings_this_month: number;
    pending_payment: number;
    new_enquiries: number;
    unmatched_payments: number;
    pending_reviews: number;
    travellers_next_30: number;
  };
  revenue_by_month: { month: string; label: string; kes: number }[];
  revenue_by_method: { method: PaymentMethod; kes: number }[];
  top_tours: { tour: string; kes: number }[];
  upcoming_departures: {
    id: number;
    tour: string;
    tour_id: number;
    start_date: string;
    capacity: number;
    seats_booked: number;
    status: string;
  }[];
  recent_bookings: {
    reference: string;
    tour: string;
    contact_name: string;
    status: BookingStatus;
    total: number;
    currency: Currency;
    created_at: string;
  }[];
  recent_payments: {
    reference: string;
    booking_reference: string;
    method: PaymentMethod;
    amount: number;
    currency: Currency;
    status: PaymentStatus;
    created_at: string;
  }[];
}

export interface BookingRow {
  reference: string;
  status: BookingStatus;
  tour_title: string;
  travel_date: string;
  adults: number;
  children: number;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  currency: Currency;
  total: number;
  amount_paid: number;
  balance: number;
  balance_due_date: string | null;
  source: string;
  created_at: string;
}

export interface AdminPayment extends Payment {
  provider_reference: string | null;
  recorded_by_name: string | null;
  fx_rate: number;
}

export interface AdminBooking extends Omit<Booking, "payments"> {
  internal_notes: string | null;
  source: string;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  reminders_sent: string[];
  user_id: number | null;
  payments: AdminPayment[];
  departure_status: string | null;
  manage_url: string;
}

export interface PaymentRow extends AdminPayment {
  booking_reference: string;
  contact_name: string;
}

export interface UnmatchedPayment {
  id: number;
  provider: string;
  receipt_number: string;
  amount: number;
  currency: Currency;
  phone: string | null;
  payer_name: string | null;
  account_reference: string | null;
  resolved: boolean;
  created_at: string;
}

export interface TourRow {
  id: number;
  title: string;
  slug: string;
  status: "draft" | "published" | "archived";
  tour_type: string;
  duration_days: number;
  featured: boolean;
  is_deal: boolean;
  hero_image: string | null;
  destination_name: string | null;
  from_kes: number | null;
  upcoming_departures: number;
  bookings_count: number;
}

export interface AdminAddOn extends AddOn {
  active: boolean;
}

export interface AdminTour extends Omit<TourDetail, "add_ons"> {
  status: "draft" | "published" | "archived";
  destination_id: number | null;
  category_ids: number[];
  add_ons: AdminAddOn[];
  bookings_count: number;
}

export interface DepartureRow {
  id: number;
  tour_id: number;
  tour_title: string;
  tour_slug: string;
  start_date: string;
  end_date: string;
  capacity: number;
  seats_booked: number;
  seats_left: number;
  status: string;
  price_adjustment_percent: number;
  notes: string | null;
  bookings: number;
  revenue: Record<string, number>;
}

export interface Enquiry {
  id: number;
  kind: string;
  name: string;
  email: string;
  phone: string | null;
  country: string | null;
  tour_id: number | null;
  tour_title: string | null;
  destinations: string[];
  interests: string[];
  start_date: string | null;
  flexible_dates: boolean;
  duration_days: number | null;
  adults: number;
  children: number;
  budget_per_person: number | null;
  budget_currency: Currency;
  accommodation_level: string | null;
  message: string | null;
  status: "new" | "contacted" | "quoted" | "won" | "lost";
  assigned_to_id: number | null;
  assigned_to_name: string | null;
  notes: { at: string; by: string; text: string }[];
  source: string;
  created_at: string;
}

export interface AdminReview {
  id: number;
  tour_id: number | null;
  tour_title: string | null;
  booking_id: number | null;
  name: string;
  country: string | null;
  rating: number;
  title: string | null;
  body: string;
  travel_month: string | null;
  status: "pending" | "approved" | "rejected";
  featured: boolean;
  verified: boolean;
  created_at: string;
}

export interface CustomerRow {
  email: string;
  name: string;
  phone: string;
  country: string | null;
  bookings: number;
  trips: number;
  spent_kes: number;
  last_travel_date: string | null;
  first_booking: string;
  has_account: boolean;
}

export interface AuditEntry {
  id: number;
  user_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  summary: string | null;
  details: Record<string, unknown>;
  ip: string | null;
  created_at: string;
}
