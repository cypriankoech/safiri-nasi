"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { EmptyRow, PageHeader, SearchInput, Table, TableSkeleton } from "@/components/admin/ui";
import { Select } from "@/components/ui/field";
import { api } from "@/lib/api";
import type { AuditEntry } from "@/lib/admin-types";
import { fmtDateTime } from "@/lib/format";

const ENTITIES = ["booking", "payment", "tour", "departure", "user", "settings", "promo", "review", "enquiry", "destination", "blog_post", "faq"];

export default function AuditPage() {
  const [q, setQ] = useState("");
  const [entity, setEntity] = useState("");
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (entity) params.set("entity", entity);
  const { data, isLoading } = useQuery({ queryKey: ["admin", "audit", params.toString()], queryFn: () => api<AuditEntry[]>(`/api/admin/audit?${params}`) });
  return (
    <>
      <PageHeader title="Audit log" description="Who changed what, and when. Kept for record keeping and dispute resolution." />
      <div className="mb-4 flex flex-wrap gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search summary or ID" className="w-full sm:w-72" />
        <Select value={entity} onChange={(e) => setEntity(e.target.value)} className="h-10 w-44 text-sm" aria-label="Entity">
          <option value="">Everything</option>
          {ENTITIES.map((e) => <option key={e} value={e}>{e.replace("_", " ")}</option>)}
        </Select>
      </div>
      {isLoading ? <TableSkeleton /> : (
        <Table>
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
          <tbody>
            {data?.length ? data.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap">{fmtDateTime(a.created_at)}</td>
                <td>{a.user_name}<span className="block text-xs text-muted">{a.ip}</span></td>
                <td className="font-mono text-xs">{a.action}</td>
                <td>{a.entity} {a.entity_id}</td>
                <td className="max-w-md text-xs text-muted">{a.summary}{Object.keys(a.details).length > 0 && <span className="block font-mono">{JSON.stringify(a.details)}</span>}</td>
              </tr>
            )) : <EmptyRow cols={5}>No activity recorded yet.</EmptyRow>}
          </tbody>
        </Table>
      )}
    </>
  );
}
