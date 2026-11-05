"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Stepper, Textarea } from "@/components/ui/field";
import { api } from "@/lib/api";
import type { SiteInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

const INTERESTS = ["Wildlife safari", "Beach", "Culture & food", "Hiking", "Honeymoon", "Family fun", "Luxury", "Budget-friendly", "Photography", "Birding"];

export function EnquiryForm({
  destinations,
  kind = "tailor_made",
  tourSlug,
}: {
  destinations: SiteInfo["destinations"];
  kind?: "tailor_made" | "contact";
  tourSlug?: string;
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    country: "",
    start_date: "",
    duration_days: "",
    budget_per_person: "",
    budget_currency: "KES",
    accommodation_level: "",
    message: "",
  });
  const [picked, setPicked] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });
  const toggle = (list: string[], setList: (v: string[]) => void, v: string) =>
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api("/api/enquiries", {
        body: {
          kind: tourSlug ? "tour" : kind,
          tour_slug: tourSlug,
          name: form.name,
          email: form.email,
          phone: form.phone || null,
          country: form.country || null,
          destinations: picked,
          interests,
          start_date: form.start_date || null,
          duration_days: form.duration_days ? Number(form.duration_days) : null,
          adults,
          children,
          budget_per_person: form.budget_per_person ? Number(form.budget_per_person) : null,
          budget_currency: form.budget_currency,
          accommodation_level: form.accommodation_level || null,
          message: form.message || null,
        },
      });
      setSent(true);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="rounded-3xl border border-lime bg-success-bg p-10 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
        <h2 className="mt-3 text-2xl font-extrabold">Asante, {form.name.split(" ")[0]}!</h2>
        <p className="mt-1 text-muted">A travel expert will be in touch within one working day. Check your inbox for a confirmation.</p>
      </div>
    );
  }

  const tailor = kind === "tailor_made";
  return (
    <form onSubmit={submit} className="space-y-6 rounded-3xl border border-border bg-surface p-6 md:p-8">
      {tailor && (
        <>
          <div>
            <p className="mb-2 text-sm font-semibold">Where would you like to go?</p>
            <div className="flex flex-wrap gap-2">
              {destinations.map((d) => (
                <button
                  type="button"
                  key={d.slug}
                  onClick={() => toggle(picked, setPicked, d.name)}
                  aria-pressed={picked.includes(d.name)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition",
                    picked.includes(d.name) ? "border-forest bg-forest text-white dark:border-lime dark:bg-lime dark:text-forest-deep" : "border-border hover:border-lime",
                  )}
                >
                  {d.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">What are you into?</p>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => toggle(interests, setInterests, i)}
                  aria-pressed={interests.includes(i)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition",
                    interests.includes(i) ? "border-sun bg-sun text-forest-deep" : "border-border hover:border-sun",
                  )}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Approximate start date">
              <Input type="date" value={form.start_date} onChange={set("start_date")} />
            </Field>
            <Field label="Trip length (days)">
              <Input type="number" min={1} max={90} value={form.duration_days} onChange={set("duration_days")} placeholder="e.g. 7" />
            </Field>
            <Field label="Accommodation style">
              <Select value={form.accommodation_level} onChange={set("accommodation_level")}>
                <option value="">No preference</option>
                <option>Budget</option>
                <option>Mid-range</option>
                <option>Luxury</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-[auto_auto_1fr]">
            <div>
              <p className="mb-1.5 text-sm font-semibold">Adults</p>
              <Stepper label="adults" value={adults} min={1} max={100} onChange={setAdults} />
            </div>
            <div>
              <p className="mb-1.5 text-sm font-semibold">Children</p>
              <Stepper label="children" value={children} min={0} max={100} onChange={setChildren} />
            </div>
            <Field label="Budget per person (optional)">
              <div className="flex gap-2">
                <Select value={form.budget_currency} onChange={set("budget_currency")} className="w-24" aria-label="Budget currency">
                  <option>KES</option>
                  <option>USD</option>
                </Select>
                <Input type="number" min={0} value={form.budget_per_person} onChange={set("budget_per_person")} placeholder="e.g. 80000" />
              </div>
            </Field>
          </div>
        </>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name">
          <Input required minLength={2} autoComplete="name" value={form.name} onChange={set("name")} />
        </Field>
        <Field label="Email">
          <Input required type="email" autoComplete="email" value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Phone / WhatsApp">
          <Input type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="Country">
          <Input autoComplete="country-name" value={form.country} onChange={set("country")} />
        </Field>
      </div>
      <Field label={tailor ? "Anything else we should know?" : "Your message"}>
        <Textarea required={!tailor} value={form.message} onChange={set("message")} placeholder={tailor ? "Special occasions, must-sees, mobility needs…" : "How can we help?"} />
      </Field>
      <Button type="submit" size="lg" loading={loading}>
        {tailor ? "Send my trip request" : "Send message"}
      </Button>
    </form>
  );
}
