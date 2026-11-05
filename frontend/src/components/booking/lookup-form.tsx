"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { api, bookingTokens } from "@/lib/api";

export function LookupForm({ initialRef }: { initialRef?: string }) {
  const router = useRouter();
  const [reference, setReference] = useState(initialRef ?? "");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api<{ booking: { reference: string }; access_token: string }>("/api/bookings/lookup", {
        body: { reference: reference.trim().toUpperCase(), email },
      });
      bookingTokens.set(res.booking.reference, res.access_token);
      router.push(`/booking/${res.booking.reference}`);
    } catch (err) {
      toast.error((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Booking reference" hint="It looks like SN-7K2M9Q and is in your confirmation email.">
        <Input required value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} placeholder="SN-XXXXXX" autoCapitalize="characters" />
      </Field>
      <Field label="Email used to book">
        <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Find my booking
      </Button>
    </form>
  );
}
