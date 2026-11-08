"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyRow, PageHeader, Table, TableSkeleton } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { fmtShortDate } from "@/lib/format";
import type { User } from "@/lib/types";

export default function UsersPage() {
  const client = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "users"], queryFn: () => api<User[]>("/api/admin/users?role=staff,admin") });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "", role: "staff" });
  const create = useMutation({
    mutationFn: () => api<User>("/api/admin/users", { body: { ...form, phone: form.phone || null } }),
    onSuccess: () => { toast.success("Team member added"); setAdding(false); client.invalidateQueries({ queryKey: ["admin", "users"] }); },
    onError: (e) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => api<User>(`/api/admin/users/${id}`, { method: "PATCH", body }),
    onSuccess: () => { toast.success("Updated"); client.invalidateQueries({ queryKey: ["admin", "users"] }); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <>
      <PageHeader title="Team" description="Staff can manage bookings, tours and content. Admins can also manage the team, settings and audit log." actions={<Button size="sm" onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" /> Add team member</Button>} />
      {isLoading ? <TableSkeleton rows={3} /> : (
        <Table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Since</th></tr></thead>
          <tbody>
            {data?.length ? data.map((u) => (
              <tr key={u.id}>
                <td className="font-semibold">{u.full_name}</td>
                <td>{u.email}</td>
                <td>
                  <select value={u.role} onChange={(e) => update.mutate({ id: u.id, body: { role: e.target.value } })} className="rounded-lg border border-border bg-surface px-2 py-1 text-sm" aria-label="Role">
                    <option value="staff">Staff</option><option value="admin">Admin</option><option value="customer">Remove access</option>
                  </select>
                </td>
                <td>
                  <button onClick={() => update.mutate({ id: u.id, body: { is_active: !u.is_active } })}>
                    <Badge tone={u.is_active ? "green" : "red"}>{u.is_active ? "Active" : "Disabled"}</Badge>
                  </button>
                </td>
                <td>{fmtShortDate(u.created_at)}</td>
              </tr>
            )) : <EmptyRow cols={5}>No team members.</EmptyRow>}
          </tbody>
        </Table>
      )}
      <Dialog open={adding} onClose={() => setAdding(false)} title="Add team member" footer={<><Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button loading={create.isPending} onClick={() => create.mutate()}>Add</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Role"><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="staff">Staff</option><option value="admin">Admin</option></Select></Field>
          <Field label="Temporary password" hint="At least 8 characters. Ask them to change it after logging in." className="sm:col-span-2"><Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        </div>
      </Dialog>
    </>
  );
}
