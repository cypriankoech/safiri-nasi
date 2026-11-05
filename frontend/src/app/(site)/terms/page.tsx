import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/site/legal-page";

export const metadata: Metadata = { title: "Terms & conditions" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms & conditions" updated="November 2026">
      <p>
        These terms apply to bookings made with Safiri Nasi Tour &amp; Travel (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By
        booking you confirm that you are at least 18 years old and authorised to book on behalf of everyone in your
        party.
      </p>
      <h2>Prices</h2>
      <p>
        Prices are per person sharing unless stated. Resident rates apply to East African citizens and residents, who
        must show valid ID at park gates; travellers who cannot will pay the non-resident park fee difference. Prices
        may change before you book, but once your booking is confirmed the price is fixed except for government taxes
        or park fee changes outside our control.
      </p>
      <h2>Travel documents &amp; insurance</h2>
      <p>
        You are responsible for valid passports, visas or eTA, vaccinations and travel insurance. We strongly recommend
        insurance that covers cancellation, medical evacuation and personal belongings.
      </p>
      <h2>Your responsibilities</h2>
      <p>Please follow the guidance of your guide and park rules, and respect local communities and wildlife.</p>
      <h2>Liability</h2>
      <p>
        We carefully select our suppliers but are not liable for events beyond our reasonable control, including
        weather, wildlife movements, strikes or government action.
      </p>
      <h2>Cancellations</h2>
      <p>
        See our <Link href="/booking-policy">booking &amp; cancellation policy</Link>.
      </p>
      <h2>Governing law</h2>
      <p>These terms are governed by the laws of Kenya.</p>
    </LegalPage>
  );
}
