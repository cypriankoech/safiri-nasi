import type { Metadata } from "next";
import { LegalPage } from "@/components/site/legal-page";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="November 2026">
      <p>
        We respect your privacy and process personal data in line with Kenya&apos;s Data Protection Act, 2019.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>Contact details (name, email, phone, country) to manage your booking.</li>
        <li>Traveller details (names, nationality, passport or ID numbers, dietary needs) required by parks, hotels and airlines.</li>
        <li>Payment records such as M-Pesa receipt numbers. We never see or store your card number or mobile money PIN.</li>
      </ul>
      <h2>How we use it</h2>
      <p>
        To deliver your trip, send confirmations and reminders, meet legal and accounting obligations and, if you
        subscribe, to send our newsletter (you can unsubscribe at any time).
      </p>
      <h2>Sharing</h2>
      <p>
        We share only what is needed with the camps, lodges, transport providers and payment processors (Safaricom,
        Airtel, DPO Pay) involved in your trip. We never sell your data.
      </p>
      <h2>Your rights</h2>
      <p>You can request access to, correction of or deletion of your data by emailing us.</p>
    </LegalPage>
  );
}
