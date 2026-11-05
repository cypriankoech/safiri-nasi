import type { Metadata } from "next";
import { LegalPage } from "@/components/site/legal-page";

export const metadata: Metadata = { title: "Booking & cancellation policy" };

export default function BookingPolicyPage() {
  return (
    <LegalPage title="Booking & cancellation policy" updated="November 2026">
      <h2>Making a booking</h2>
      <p>
        When you book online, your seats are held for 30 minutes while you pay. A booking is confirmed once we receive
        the deposit shown at checkout (usually 30%, or 40–50% for trips where permits must be bought in advance, such as
        migration safaris and gorilla trekking). You&apos;ll receive an email confirmation, receipt and invoice.
      </p>
      <h2>Balance payments</h2>
      <p>
        The balance is due by the date shown on your booking, typically 14–60 days before travel depending on the trip.
        Bookings made after that date must be paid in full. We send reminders 14, 7 and 2 days before the balance is due.
        If the balance is not received, we may cancel the booking and apply the cancellation terms below.
      </p>
      <h2>Ways to pay</h2>
      <ul>
        <li>M-Pesa (STK push from our website, or our Paybill using your booking reference as the account number)</li>
        <li>Airtel Money</li>
        <li>Visa and Mastercard, processed securely by DPO Pay</li>
        <li>Bank transfer (confirmed within one working day)</li>
      </ul>
      <p>Mobile money is charged in Kenya shillings. USD bookings are converted at the rate shown at checkout.</p>
      <h2>Cancellations by you</h2>
      <ul>
        <li>More than 60 days before travel: full refund less a KES 2,500 administration fee.</li>
        <li>31–60 days before travel: 50% of the deposit is refunded.</li>
        <li>30 days or fewer: the deposit is non-refundable; payments beyond the deposit are refunded less non-recoverable costs (park fees, permits, flights).</li>
      </ul>
      <p>Individual tours may have different terms. These are shown on the tour page and your invoice and take precedence.</p>
      <h2>Changes</h2>
      <p>Date changes are free up to 21 days before departure, subject to availability and any price difference.</p>
      <h2>Cancellations by us</h2>
      <p>
        If we have to cancel a departure (for example, if minimum numbers aren&apos;t reached or for safety reasons) you can
        choose another date or receive a full refund.
      </p>
      <h2>Refunds</h2>
      <p>Refunds are returned to the original payment method within 14 days.</p>
    </LegalPage>
  );
}
