"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { api, bookingTokens } from "@/lib/api";
import { money } from "@/lib/format";
import type { PaymentStatusResponse } from "@/lib/types";
import { useClientValue } from "@/lib/use-client-value";
import { PENDING_CARD_KEY } from "./payment-panel";
import Link from "next/link";

function readPending(): string {
  try {
    return sessionStorage.getItem(PENDING_CARD_KEY) ?? "";
  } catch {
    return "";
  }
}

export function PaymentReturn({ paymentRef }: { paymentRef: string }) {
  const pendingRaw = useClientValue(readPending, undefined as string | undefined);
  const pending = pendingRaw ? (JSON.parse(pendingRaw) as { payment: string; booking: string }) : null;
  const bookingRef = pending?.payment === paymentRef ? pending.booking : null;
  const token = bookingRef ? bookingTokens.get(bookingRef) : null;

  const verify = useQuery({
    queryKey: ["verify", paymentRef, token],
    enabled: pendingRaw !== undefined,
    queryFn: () => api<PaymentStatusResponse>(`/api/payments/${paymentRef}/verify`, { method: "POST", bookingToken: token }),
    refetchInterval: (q) => (q.state.data?.payment.status === "processing" ? 4000 : false),
    retry: false,
  });

  const data = verify.data;
  const target = data ? `/booking/${data.booking_reference}` : bookingRef ? `/booking/${bookingRef}` : "/booking";

  if (verify.error) {
    return (
      <Result icon={<XCircle className="h-14 w-14 text-danger" />} title="We couldn't confirm this payment here">
        If money left your account, it will reflect on your booking shortly and we&apos;ll email your receipt.
        <Link href={target} className={buttonClass({ className: "mt-6" })}>Go to my booking</Link>
      </Result>
    );
  }
  if (!data || data.payment.status === "processing") {
    return (
      <Result icon={<Loader2 className="h-14 w-14 animate-spin text-lime-strong" />} title="Confirming your card payment…">
        This usually takes a few seconds. Please don&apos;t close this page.
      </Result>
    );
  }
  if (data.payment.status === "success") {
    return (
      <Result icon={<CheckCircle2 className="h-14 w-14 text-success" />} title="Payment successful!">
        We received {money(data.payment.amount, data.payment.currency)}. Your receipt is on its way to your inbox.
        <Link href={target} className={buttonClass({ className: "mt-6" })}>View my booking</Link>
      </Result>
    );
  }
  return (
    <Result icon={<XCircle className="h-14 w-14 text-danger" />} title="Payment not completed">
      {data.payment.failure_reason ?? "Your card payment didn't go through."}
      <Link href={`${target}#pay`} className={buttonClass({ className: "mt-6" })}>Try again</Link>
    </Result>
  );
}

function Result({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center rounded-3xl border border-border bg-surface p-10 text-center shadow-soft">
      {icon}
      <h1 className="mt-4 text-2xl font-extrabold">{title}</h1>
      <div className="mt-2 flex flex-col items-center text-muted">{children}</div>
    </div>
  );
}
