import type { Metadata } from "next";
import { Ticket } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { LookupForm } from "@/components/booking/lookup-form";
import { Container } from "@/components/ui/misc";

export const metadata: Metadata = {
  title: "Manage your booking",
  description: "Find your Safiri Nasi booking to pay a balance, download your invoice or travel voucher.",
};

export default function LookupPage({ searchParams }: PageProps<"/booking">) {
  return (
    <Container className="py-16">
      <div className="mx-auto max-w-md rounded-3xl border border-border bg-surface p-8 shadow-soft">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-lime/20">
          <Ticket className="h-6 w-6 text-lime-strong" />
        </span>
        <h1 className="mt-4 text-3xl font-extrabold text-primary">Manage your booking</h1>
        <p className="mt-1 mb-6 text-muted">Pay your balance, download documents or check your trip details.</p>
        <Suspense fallback={<LookupForm />}>
          <LookupWithRef searchParams={searchParams} />
        </Suspense>
        <p className="mt-6 text-center text-sm text-muted">
          Have an account?{" "}
          <Link href="/login?next=/account" className="font-semibold text-primary underline">
            Log in to see all your trips
          </Link>
        </p>
      </div>
    </Container>
  );
}

async function LookupWithRef({ searchParams }: { searchParams: PageProps<"/booking">["searchParams"] }) {
  const sp = await searchParams;
  return <LookupForm initialRef={typeof sp.ref === "string" ? sp.ref : undefined} />;
}
