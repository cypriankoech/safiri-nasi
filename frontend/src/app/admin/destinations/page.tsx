"use client";

import { useState } from "react";
import { CrudManager } from "@/components/admin/crud-manager";
import { PageHeader } from "@/components/admin/ui";
import { Badge } from "@/components/ui/misc";
import { REGION_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function DestinationsAdminPage() {
  const [tab, setTab] = useState<"destinations" | "categories">("destinations");
  return (
    <>
      <PageHeader title="Destinations & trip styles" description="Where you go and how you travel: these power the menus, filters and landing pages." />
      <div className="mb-5 flex w-fit gap-1 rounded-full bg-surface-2 p-1 text-sm font-semibold">
        {(["destinations", "categories"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("rounded-full px-4 py-1.5 capitalize", tab === t ? "bg-surface shadow-sm" : "text-muted")}>
            {t === "categories" ? "Trip styles" : t}
          </button>
        ))}
      </div>
      {tab === "destinations" ? (
        <CrudManager
          endpoint="/api/admin/destinations"
          queryKey="destinations"
          noun="Destination"
          defaults={{ name: "", region: "kenya", country: "Kenya", summary: "", description: "", hero_image: null, gallery: [], best_time: "", highlights: [], latitude: null, longitude: null, featured: false, sort_order: 0 }}
          toPayload={({ tour_count: _tc, slug, ...rest }) => ({ ...rest, slug: slug || null })}
          columns={[
            { label: "Name", render: (r) => <b>{String(r.name)}</b> },
            { label: "Region", render: (r) => REGION_LABELS[r.region as keyof typeof REGION_LABELS] },
            { label: "Country", render: (r) => String(r.country) },
            { label: "Tours", render: (r) => String(r.tour_count ?? 0) },
            { label: "Featured", render: (r) => (r.featured ? <Badge tone="green">Featured</Badge> : null) },
          ]}
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "slug", label: "URL slug", hint: "Blank = auto" },
            { name: "region", label: "Region", type: "select", options: [{ value: "kenya", label: "Kenya" }, { value: "africa", label: "Africa" }, { value: "international", label: "International" }] },
            { name: "country", label: "Country" },
            { name: "summary", label: "Summary", type: "textarea" },
            { name: "description", label: "Description", type: "textarea" },
            { name: "hero_image", label: "Hero photo", type: "image" },
            { name: "best_time", label: "Best time to visit", full: true },
            { name: "highlights", label: "Highlights", type: "lines" },
            { name: "latitude", label: "Latitude", type: "number" },
            { name: "longitude", label: "Longitude", type: "number" },
            { name: "sort_order", label: "Sort order", type: "number" },
            { name: "featured", label: "Feature on home page", type: "checkbox" },
          ]}
        />
      ) : (
        <CrudManager
          endpoint="/api/admin/categories"
          queryKey="categories"
          noun="Trip style"
          defaults={{ name: "", description: "", icon: "binoculars", image: null, sort_order: 0 }}
          toPayload={({ tour_count: _tc, slug, ...rest }) => ({ ...rest, slug: slug || null })}
          columns={[
            { label: "Name", render: (r) => <b>{String(r.name)}</b> },
            { label: "Description", render: (r) => <span className="text-muted">{String(r.description ?? "")}</span> },
            { label: "Icon", render: (r) => String(r.icon ?? "") },
          ]}
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "slug", label: "URL slug", hint: "Blank = auto" },
            { name: "description", label: "Description", type: "textarea" },
            { name: "icon", label: "Icon", type: "select", options: ["binoculars", "palm", "tent", "sun", "mountain", "plane", "heart", "users", "landmark"].map((v) => ({ value: v, label: v })) },
            { name: "sort_order", label: "Sort order", type: "number" },
            { name: "image", label: "Image", type: "image" },
          ]}
        />
      )}
    </>
  );
}
