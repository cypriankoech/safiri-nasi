"use client";

import { CheckCircle2, CreditCard, Landmark, Loader2, ShieldCheck, Smartphone, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { Booking, Payment, PaymentStatusResponse, SiteSettings } from "@/lib/types";
import { cn } from "@/lib/utils";

type Method = "mpesa" | "airtel" | "card" | "manual";

const SAFARICOM = /^(?:254|0)?(?:7(?:[0129]\d|4[0-35-68]|5[7-9]|6[89])|11[0-5])\d{6}$/;
const AIRTEL = /^(?:254|0)?(?:7(?:3\d|8\d|5[0-6]|62)|10[0-2])\d{6}$/;

function guessMethod(phone: string): Method {
  const digits = phone.replace(/\D/g, "");
  if (AIRTEL.test(digits)) return "airtel";
  if (SAFARICOM.test(digits)) return "mpesa";
  return "card";
}

export const PENDING_CARD_KEY = "sn_pending_card";

export function PaymentPanel({
  booking,
  token,
  settings,
  onPaid,
}: {
  booking: Booking;
  token: string | null;
  settings: SiteSettings;
  onPaid: () => void;
}) {
  const enabled = settings.payment_methods ?? {};
  const [method, setMethod] = useState<Method>(() => guessMethod(booking.contact_phone));
  const [phone, setPhone] = useState(booking.contact_phone.startsWith("+254") ? `0${booking.contact_phone.slice(4)}` : booking.contact_phone);
  const [payFull, setPayFull] = useState(false);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [starting, setStarting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const due = payFull ? booking.balance : booking.amount_due_now;
  const showFullOption = booking.balance > booking.amount_due_now;
  const kesAmount = booking.currency === "USD" ? Math.ceil(due * settings.usd_to_kes) : due;

  useEffect(() => {
    if (!payment || payment.status !== "processing" || payment.method === "card") return;
    const started = Date.now();
    const tick = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    timer.current = setInterval(async () => {
      try {
        const res = await api<PaymentStatusResponse>(`/api/payments/${payment.reference}`, { bookingToken: token });
        if (res.payment.status !== "processing") {
          setPayment(res.payment);
          if (res.payment.status === "success") {
            toast.success("Payment received. Asante!");
            onPaid();
          }
        }
      } catch {
        /* keep polling */
      }
    }, 3000);
    return () => {
      clearInterval(tick);
      if (timer.current) clearInterval(timer.current);
    };
  }, [payment, token, onPaid]);

  const start = async () => {
    setStarting(true);
    try {
      const p = await api<Payment>(`/api/bookings/${booking.reference}/payments`, {
        body: { method, phone: method === "card" ? null : phone, pay_full: payFull },
        bookingToken: token,
      });
      if (method === "card" && p.redirect_url) {
        sessionStorage.setItem(PENDING_CARD_KEY, JSON.stringify({ payment: p.reference, booking: booking.reference }));
        window.location.href = p.redirect_url;
        return;
      }
      setSeconds(0);
      setPayment(p);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setStarting(false);
    }
  };

  if (due <= 0) return null;

  // Waiting for the customer to approve on their phone
  if (payment && payment.method !== "card") {
    const label = payment.method === "mpesa" ? "M-Pesa" : "Airtel Money";
    if (payment.status === "processing") {
      return (
        <div className="rounded-3xl border-2 border-lime bg-surface p-6 text-center" aria-live="polite">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-lime/20">
            <Smartphone className="h-8 w-8 animate-pulse text-lime-strong" />
          </div>
          <h3 className="mt-4 text-xl font-bold">Check your phone</h3>
          <p className="mt-1 text-muted">
            We sent an {label} request for <b className="text-text">{money(payment.amount, payment.currency)}</b> to{" "}
            <b className="text-text">+{payment.phone}</b>. Enter your PIN to complete the payment.
          </p>
          {payment.notes?.startsWith("[Test mode]") && (
            <p className="mx-auto mt-3 max-w-sm rounded-xl bg-warning-bg p-2 text-xs text-warning">
              Test mode: this payment approves itself in a few seconds. Numbers ending in 000 are declined.
            </p>
          )}
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Waiting for confirmation… {seconds}s
          </p>
          {seconds > 45 && (
            <Button variant="link" className="mt-2" onClick={() => setPayment(null)}>
              Didn&apos;t get the prompt? Try again
            </Button>
          )}
        </div>
      );
    }
    if (payment.status === "success") {
      return (
        <div className="rounded-3xl border-2 border-lime bg-success-bg p-6 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
          <h3 className="mt-3 text-xl font-bold">Payment received!</h3>
          <p className="text-muted">
            {label} receipt <b className="text-text">{payment.receipt_number}</b>. We&apos;ve emailed your receipt.
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-3xl border border-danger/40 bg-danger-bg p-6 text-center">
        <XCircle className="mx-auto h-12 w-12 text-danger" />
        <h3 className="mt-3 text-lg font-bold">Payment not completed</h3>
        <p className="text-sm text-muted">{payment.failure_reason ?? "The payment didn't go through."}</p>
        <Button className="mt-4" onClick={() => setPayment(null)}>
          Try again
        </Button>
      </div>
    );
  }

  const methods = [
    { id: "mpesa" as const, label: "M-Pesa", icon: Smartphone, show: enabled.mpesa !== false },
    { id: "airtel" as const, label: "Airtel Money", icon: Smartphone, show: enabled.airtel !== false },
    { id: "card" as const, label: "Card", icon: CreditCard, show: enabled.card !== false },
    { id: "manual" as const, label: "Paybill / Bank", icon: Landmark, show: enabled.paybill === true || enabled.bank === true },
  ].filter((m) => m.show);

  return (
    <div className="rounded-3xl border border-border bg-surface p-6">
      <h3 className="text-xl font-bold">Make a payment</h3>
      {showFullOption && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {[false, true].map((full) => (
            <button
              key={String(full)}
              onClick={() => setPayFull(full)}
              className={cn(
                "rounded-2xl border p-3 text-left text-sm transition",
                payFull === full ? "border-lime bg-lime/10 ring-2 ring-lime" : "border-border",
              )}
              aria-pressed={payFull === full}
            >
              <span className="block text-muted">{full ? "Full balance" : booking.amount_paid > 0 ? "Amount due now" : "Deposit"}</span>
              <b className="text-base">{money(full ? booking.balance : booking.amount_due_now, booking.currency)}</b>
            </button>
          ))}
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label="Payment method">
        {methods.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={method === m.id}
            onClick={() => setMethod(m.id)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-2xl border p-3 text-sm font-semibold transition",
              method === m.id ? "border-forest bg-forest text-white dark:border-lime dark:bg-lime dark:text-forest-deep" : "border-border hover:border-lime",
            )}
          >
            <m.icon className="h-5 w-5" />
            {m.label}
          </button>
        ))}
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
        <ShieldCheck className="h-3.5 w-3.5 text-lime-strong" /> Payments are processed securely by Paystack.
      </p>
      <div className="mt-4">
        {method === "mpesa" || method === "airtel" ? (
          <div className="space-y-4">
            <Field
              label={`${method === "mpesa" ? "Safaricom M-Pesa" : "Airtel Money"} number`}
              hint="You'll get a prompt on this phone to enter your PIN."
            >
              <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XX XXX XXX" />
            </Field>
            {booking.currency === "USD" && (
              <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">
                Mobile money is charged in shillings: <b className="text-text">{money(kesAmount, "KES")}</b> at KES{" "}
                {settings.usd_to_kes} per US$.
              </p>
            )}
            <Button size="lg" className="w-full" loading={starting} onClick={start}>
              Pay {money(kesAmount, "KES")} with {method === "mpesa" ? "M-Pesa" : "Airtel Money"}
            </Button>
          </div>
        ) : method === "card" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              You&apos;ll be taken to Paystack&apos;s secure checkout to pay with Visa or Mastercard, then brought straight
              back here.
            </p>
            <Button size="lg" className="w-full" loading={starting} onClick={start}>
              <CreditCard className="h-5 w-5" /> Pay {money(due, booking.currency)} by card
            </Button>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            {enabled.paybill === true && settings.mpesa_paybill && (
              <div className="rounded-2xl bg-surface-2 p-4">
                <p className="font-bold">M-Pesa Paybill</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
                  <li>Go to M-Pesa › Lipa na M-Pesa › Pay Bill</li>
                  <li>
                    Business number: <b className="text-text">{settings.mpesa_paybill}</b>
                  </li>
                  <li>
                    Account number: <b className="text-text">{booking.reference}</b>
                  </li>
                  <li>
                    Amount: <b className="text-text">{money(kesAmount, "KES")}</b>
                  </li>
                </ol>
                <p className="mt-2 text-xs text-muted">Payments with your booking reference are matched automatically.</p>
              </div>
            )}
            {enabled.bank === true && settings.bank_details?.account_number && (
              <div className="rounded-2xl bg-surface-2 p-4">
                <p className="font-bold">Bank transfer</p>
                <p className="mt-1 text-muted">
                  {settings.bank_details.bank_name} · {settings.bank_details.account_name}
                  <br />
                  A/C {settings.bank_details.account_number}
                  {settings.bank_details.branch && ` · ${settings.bank_details.branch}`}
                  {settings.bank_details.swift_code && ` · SWIFT ${settings.bank_details.swift_code}`}
                  <br />
                  Reference: <b className="text-text">{booking.reference}</b>
                </p>
                <p className="mt-2 text-xs text-muted">Bank payments are confirmed by our team within one working day.</p>
              </div>
            )}
            {!settings.mpesa_paybill && !settings.bank_details?.account_number && (
              <p className="text-muted">Contact us for Paybill and bank details.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
