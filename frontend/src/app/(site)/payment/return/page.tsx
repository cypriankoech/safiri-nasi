import type { Metadata } from "next";
import { Suspense } from "react";
import { PaymentReturn } from "@/components/booking/payment-return";
import { Container, Skeleton } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Payment status", robots: { index: false } };

export default function PaymentReturnPage({ searchParams }: PageProps<"/payment/return">) {
  return (
    <Container className="py-20">
      <Suspense fallback={<Skeleton className="mx-auto h-72 max-w-md" />}>
        <Inner searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Inner({ searchParams }: { searchParams: PageProps<"/payment/return">["searchParams"] }) {
  const sp = await searchParams;
  return <PaymentReturn paymentRef={typeof sp.payment === "string" ? sp.payment : ""} />;
}
