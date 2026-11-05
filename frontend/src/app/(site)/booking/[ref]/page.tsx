import type { Metadata } from "next";
import { ManageBooking } from "@/components/booking/manage-booking";
import { Container } from "@/components/ui/misc";
import { getSite } from "@/lib/server-api";

export const metadata: Metadata = { title: "Your booking", robots: { index: false } };

export default async function BookingPage({ params, searchParams }: PageProps<"/booking/[ref]">) {
  const [{ ref }, sp, site] = await Promise.all([params, searchParams, getSite()]);
  const token = typeof sp.t === "string" ? sp.t : null;
  return (
    <Container className="py-8">
      <h1 className="mb-6 text-3xl font-extrabold text-primary md:text-4xl">Your booking</h1>
      <ManageBooking reference={ref.toUpperCase()} urlToken={token} isNew={sp.new === "1"} settings={site.settings} />
    </Container>
  );
}
