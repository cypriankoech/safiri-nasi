"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyRow, PageHeader, SearchInput, Table, TableSkeleton } from "@/components/admin/ui";
import { Button, ButtonLink } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { api } from "@/lib/api";
import type { AdminTour, TourRow } from "@/lib/admin-types";
import { money } from "@/lib/format";

export default function ToursAdminPage() {
  const router = useRouter();
  const client = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  const { data, isLoading } = useQuery({ queryKey: ["admin", "tours", params.toString()], queryFn: () => api<TourRow[]>(`/api/admin/tours?${params}`) });
  const duplicate = useMutation({
    mutationFn: (id: number) => api<AdminTour>(`/api/admin/tours/${id}/duplicate`, { method: "POST" }),
    onSuccess: (t) => {
      client.invalidateQueries({ queryKey: ["admin", "tours"] });
      toast.success("Tour duplicated as a draft");
      router.push(`/admin/tours/${t.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Tours" description="Your catalogue: itineraries, prices, departures and photos." actions={<ButtonLink href="/admin/tours/new" size="sm"><Plus className="h-4 w-4" /> New tour</ButtonLink>} />
      <div className="mb-4 flex flex-wrap gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search tours" className="w-full sm:w-72" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 w-40 text-sm" aria-label="Status">
          <option value="">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option>
        </Select>
      </div>
      {isLoading ? <TableSkeleton /> : (
        <Table>
          <thead><tr><th>Tour</th><th>Destination</th><th>From (resident)</th><th>Departures</th><th>Bookings</th><th>Status</th><th /></tr></thead>
          <tbody>
            {data?.length ? data.map((t) => (
              <tr key={t.id} className="hover:bg-surface-2">
                <td>
                  <Link href={`/admin/tours/${t.id}`} className="flex items-center gap-3">
                    <span className="relative h-11 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-3">
                      {t.hero_image && <Image src={t.hero_image} alt="" fill sizes="56px" className="object-cover" />}
                    </span>
                    <span>
                      <b className="text-primary">{t.title}</b>
                      <span className="block text-xs text-muted">{t.duration_days} days · {t.tour_type.replace("_", " ")}{t.featured ? " · featured" : ""}{t.is_deal ? " · deal" : ""}</span>
                    </span>
                  </Link>
                </td>
                <td>{t.destination_name ?? "—"}</td>
                <td>{t.from_kes ? money(t.from_kes, "KES") : "—"}</td>
                <td>{t.tour_type === "scheduled" ? `${t.upcoming_departures} upcoming` : "Any date"}</td>
                <td>{t.bookings_count}</td>
                <td><Badge tone={t.status === "published" ? "green" : t.status === "draft" ? "sun" : "neutral"}>{t.status}</Badge></td>
                <td className="text-right"><Button variant="ghost" size="sm" onClick={() => duplicate.mutate(t.id)} aria-label={`Duplicate ${t.title}`}><Copy className="h-4 w-4" /></Button></td>
              </tr>
            )) : <EmptyRow cols={7}>No tours yet.</EmptyRow>}
          </tbody>
        </Table>
      )}
    </>
  );
}
