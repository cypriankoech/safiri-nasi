"use client";

import { CrudManager } from "@/components/admin/crud-manager";
import { PageHeader } from "@/components/admin/ui";
import { Badge } from "@/components/ui/misc";
import { fmtShortDate, money } from "@/lib/format";

export default function PromosPage() {
  return (
    <>
      <PageHeader title="Promo codes" description="Discounts customers enter at checkout. Usage is counted automatically." />
      <CrudManager
        endpoint="/api/admin/promos"
        queryKey="promos"
        noun="Promo code"
        defaults={{ code: "", description: "", discount_type: "percent", value: 10, currency: null, min_total: null, max_uses: null, valid_from: null, valid_to: null, tour_id: null, active: true }}
        toPayload={({ used_count: _u, ...rest }) => rest}
        columns={[
          { label: "Code", render: (r) => <b className="font-mono">{String(r.code)}</b> },
          { label: "Discount", render: (r) => (r.discount_type === "percent" ? `${r.value}%` : money(Number(r.value), String(r.currency ?? "KES"))) },
          { label: "Used", render: (r) => `${r.used_count}${r.max_uses ? ` / ${r.max_uses}` : ""}` },
          { label: "Valid", render: (r) => (r.valid_to ? `until ${fmtShortDate(String(r.valid_to))}` : "No expiry") },
          { label: "Status", render: (r) => <Badge tone={r.active ? "green" : "neutral"}>{r.active ? "Active" : "Off"}</Badge> },
        ]}
        fields={[
          { name: "code", label: "Code", required: true, hint: "Letters, numbers, - and _" },
          { name: "description", label: "Description (shown to customer)" },
          { name: "discount_type", label: "Type", type: "select", options: [{ value: "percent", label: "Percentage" }, { value: "fixed", label: "Fixed amount" }] },
          { name: "value", label: "Value", type: "number" },
          { name: "currency", label: "Currency (fixed only)", type: "select", options: [{ value: "", label: "—" }, { value: "KES", label: "KES" }, { value: "USD", label: "USD" }] },
          { name: "min_total", label: "Minimum spend", type: "number" },
          { name: "max_uses", label: "Max uses", type: "number" },
          { name: "valid_from", label: "Valid from", type: "date" },
          { name: "valid_to", label: "Valid to", type: "date" },
          { name: "active", label: "Active", type: "checkbox" },
        ]}
      />
    </>
  );
}
