"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { refreshCatalog } from "@/app/admin/actions";
import { LinesInput, PageHeader, Panel } from "@/components/admin/ui";
import { useSession } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/api";
import type { SiteSettings } from "@/lib/types";

export default function SettingsPage() {
  const { data } = useQuery({ queryKey: ["admin", "settings"], queryFn: () => api<SiteSettings>("/api/admin/settings") });
  if (!data) return <Skeleton className="h-96" />;
  return <SettingsForm initial={data} />;
}

function SettingsForm({ initial }: { initial: SiteSettings }) {
  const client = useQueryClient();
  const { user } = useSession();
  const [s, setS] = useState(initial);
  const canEdit = user?.role === "admin";
  const set = <K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) => setS({ ...s, [k]: v });
  const save = useMutation({
    mutationFn: () => api<SiteSettings>("/api/admin/settings", { method: "PUT", body: s }),
    onSuccess: async (next) => {
      setS(next);
      await refreshCatalog();
      client.invalidateQueries({ queryKey: ["admin", "settings"] });
      toast.success("Settings saved");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Settings"
        description={canEdit ? "Business details shown across the website, emails and documents." : "Only admins can change settings."}
        actions={canEdit && <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}><Save className="h-4 w-4" /> Save settings</Button>}
      />
      <fieldset disabled={!canEdit} className="grid gap-6 xl:grid-cols-2">
        <Panel title="Business & contact">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name" className="sm:col-span-2"><Input value={s.company_name} onChange={(e) => set("company_name", e.target.value)} /></Field>
            <Field label="Tagline" className="sm:col-span-2"><Input value={s.tagline} onChange={(e) => set("tagline", e.target.value)} /></Field>
            <Field label="Phone"><Input value={s.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
            <Field label="WhatsApp number" hint="International format, digits only, e.g. 254712345678"><Input value={s.whatsapp} onChange={(e) => set("whatsapp", e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="Email"><Input value={s.email} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field label="Office hours"><Input value={s.office_hours} onChange={(e) => set("office_hours", e.target.value)} /></Field>
            <Field label="Address" className="sm:col-span-2"><Input value={s.address} onChange={(e) => set("address", e.target.value)} /></Field>
            <Field label="Licences & memberships" className="sm:col-span-2"><LinesInput value={s.licences} onChange={(v) => set("licences", v)} rows={2} /></Field>
            <Field label="Announcement bar" hint="Leave empty to hide" className="sm:col-span-2"><Input value={s.announcement} onChange={(e) => set("announcement", e.target.value)} /></Field>
          </div>
        </Panel>
        <Panel title="Payments">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="USD → KES exchange rate" hint="Used for mobile money on USD bookings and reports"><Input type="number" step="0.01" value={s.usd_to_kes} onChange={(e) => set("usd_to_kes", Number(e.target.value))} /></Field>
            <Field label="Default deposit %"><Input type="number" value={s.default_deposit_percent} onChange={(e) => set("default_deposit_percent", Number(e.target.value))} /></Field>
            <Field label="M-Pesa Paybill (shown to customers)"><Input value={s.mpesa_paybill} onChange={(e) => set("mpesa_paybill", e.target.value)} /></Field>
            <Field label="M-Pesa Till (optional)"><Input value={s.mpesa_till} onChange={(e) => set("mpesa_till", e.target.value)} /></Field>
          </div>
          <p className="mt-5 mb-2 text-sm font-semibold">Payment methods offered at checkout</p>
          <div className="flex flex-wrap gap-4">
            {(["mpesa", "airtel", "card", "paybill", "bank"] as const).map((m) => (
              <Checkbox key={m} label={{ mpesa: "M-Pesa", airtel: "Airtel Money", card: "Card", paybill: "Paybill", bank: "Bank transfer" }[m]} checked={s.payment_methods?.[m] !== false} onChange={(e) => set("payment_methods", { ...s.payment_methods, [m]: e.target.checked })} />
            ))}
          </div>
          <p className="mt-5 mb-2 text-sm font-semibold">Bank details</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["bank_name", "account_name", "account_number", "branch", "swift_code"] as const).map((k) => (
              <Field key={k} label={k.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase())}><Input value={s.bank_details?.[k] ?? ""} onChange={(e) => set("bank_details", { ...s.bank_details, [k]: e.target.value })} /></Field>
            ))}
          </div>
        </Panel>
        <Panel title="Social media">
          <div className="grid gap-4 sm:grid-cols-2">
            {(["facebook", "instagram", "tiktok", "x", "youtube"] as const).map((k) => (
              <Field key={k} label={k === "x" ? "X (Twitter)" : k[0].toUpperCase() + k.slice(1)}><Input value={s.socials?.[k] ?? ""} onChange={(e) => set("socials", { ...s.socials, [k]: e.target.value })} placeholder="https://" /></Field>
            ))}
          </div>
        </Panel>
        <Panel title="Homepage numbers">
          <div className="grid gap-4 sm:grid-cols-2">
            {(["years", "travellers", "destinations", "rating"] as const).map((k) => (
              <Field key={k} label={k[0].toUpperCase() + k.slice(1)}><Input type="number" step="any" value={s.stats?.[k] ?? 0} onChange={(e) => set("stats", { ...s.stats, [k]: Number(e.target.value) })} /></Field>
            ))}
          </div>
        </Panel>
      </fieldset>
    </>
  );
}
