"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Compass } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/components/providers";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { BookingStatusBadge, EmptyState, Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { dateRange, money } from "@/lib/format";
import type { Booking, User } from "@/lib/types";

export function AccountView() {
  const router = useRouter();
  const { user, loading, setUser } = useSession();
  const bookings = useQuery({
    queryKey: ["my-bookings"],
    queryFn: () => api<Booking[]>("/api/me/bookings"),
    enabled: !!user,
  });

  if (loading) return <Skeleton className="h-96" />;
  if (!user) {
    return (
      <EmptyState title="Please log in to see your trips">
        <ButtonLink href="/login?next=/account" className="mt-4">Log in</ButtonLink>
      </EmptyState>
    );
  }

  const list = bookings.data ?? [];
  const upcoming = list.filter((b) => !["completed", "cancelled", "expired", "refunded"].includes(b.status));
  const past = list.filter((b) => !upcoming.includes(b));

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
      <div className="space-y-10">
        <section>
          <h2 className="mb-4 text-2xl font-extrabold text-primary">Upcoming trips</h2>
          {bookings.isLoading ? (
            <Skeleton className="h-40" />
          ) : upcoming.length ? (
            <div className="space-y-4">{upcoming.map((b) => <TripRow key={b.reference} b={b} />)}</div>
          ) : (
            <EmptyState icon={<Compass className="h-6 w-6 text-muted" />} title="No upcoming trips yet">
              <ButtonLink href="/tours" className="mt-4">Find your next adventure</ButtonLink>
            </EmptyState>
          )}
        </section>
        {past.length > 0 && (
          <section>
            <h2 className="mb-4 text-2xl font-extrabold text-primary">Past &amp; cancelled</h2>
            <div className="space-y-4">{past.map((b) => <TripRow key={b.reference} b={b} />)}</div>
          </section>
        )}
      </div>
      <ProfileCard user={user} onSaved={setUser} onLogout={async () => {
        await api("/api/auth/logout", { method: "POST" });
        setUser(null);
        router.push("/");
      }} />
    </div>
  );
}

function TripRow({ b }: { b: Booking }) {
  return (
    <Link href={`/booking/${b.reference}`} className="flex gap-4 rounded-3xl border border-border bg-surface p-4 transition hover:border-lime">
      <div className="relative h-24 w-28 shrink-0 overflow-hidden rounded-2xl bg-surface-3">
        {b.tour.hero_image && <Image src={b.tour.hero_image} alt="" fill sizes="112px" className="object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold">{b.tour.title}</p>
          <BookingStatusBadge status={b.status} />
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
          <CalendarDays className="h-4 w-4" /> {dateRange(b.travel_date, b.end_date)} · {b.reference}
        </p>
        <p className="mt-1 text-sm">
          Paid {money(b.amount_paid, b.currency)} of {money(b.total, b.currency)}
          {b.balance > 0 && <b className="text-maroon"> · {money(b.balance, b.currency)} due</b>}
        </p>
      </div>
    </Link>
  );
}

function ProfileCard({ user, onSaved, onLogout }: { user: User; onSaved: (u: User) => void; onLogout: () => void }) {
  const [form, setForm] = useState({ full_name: user.full_name, phone: user.phone ?? "", country: user.country ?? "" });
  const [saving, setSaving] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      onSaved(await api<User>("/api/auth/me", { method: "PATCH", body: form }));
      toast.success("Profile saved");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <aside>
      <form onSubmit={save} className="space-y-4 rounded-3xl border border-border bg-surface p-6">
        <h2 className="text-lg font-bold">Your profile</h2>
        <p className="text-sm text-muted">{user.email}</p>
        <Field label="Full name">
          <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Country">
          <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" loading={saving}>Save</Button>
          <Button type="button" variant="ghost" onClick={onLogout}>Log out</Button>
        </div>
      </form>
    </aside>
  );
}
