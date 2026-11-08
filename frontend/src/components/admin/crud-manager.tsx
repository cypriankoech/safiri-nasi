"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { refreshCatalog } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { api } from "@/lib/api";
import { ImageField } from "./image-field";
import { ConfirmDialog, EmptyRow, LinesInput, Table, TableSkeleton } from "./ui";

type Row = Record<string, unknown> & { id: number };

export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "textarea" | "number" | "select" | "checkbox" | "lines" | "image" | "date" | "markdown";
  options?: { value: string; label: string }[];
  hint?: string;
  full?: boolean;
  required?: boolean;
};

export type ColumnDef = { label: string; render: (row: Row) => React.ReactNode; className?: string };

export function CrudManager({
  endpoint,
  queryKey,
  noun,
  fields,
  columns,
  defaults,
  toPayload,
}: {
  endpoint: string;
  queryKey: string;
  noun: string;
  fields: FieldDef[];
  columns: ColumnDef[];
  defaults: Record<string, unknown>;
  toPayload?: (form: Record<string, unknown>) => Record<string, unknown>;
}) {
  const client = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin", queryKey], queryFn: () => api<Row[]>(endpoint) });
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const done = async () => {
    await refreshCatalog();
    client.invalidateQueries({ queryKey: ["admin", queryKey] });
  };
  const save = useMutation({
    mutationFn: (form: Record<string, unknown>) => {
      const { id, ...rest } = form;
      const body = toPayload ? toPayload(rest) : rest;
      return id ? api(`${endpoint}/${id}`, { method: "PUT", body }) : api(endpoint, { body });
    },
    onSuccess: async () => {
      toast.success(`${noun} saved`);
      setEditing(null);
      await done();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`${endpoint}/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast.success(`${noun} deleted`);
      setDeleting(null);
      await done();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setEditing({ ...defaults })}>
          <Plus className="h-4 w-4" /> New {noun.toLowerCase()}
        </Button>
      </div>
      {isLoading ? (
        <TableSkeleton />
      ) : (
        <Table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.label} className={c.className}>{c.label}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.length ? (
              data.map((row) => (
                <tr key={row.id} className="hover:bg-surface-2">
                  {columns.map((c) => (
                    <td key={c.label} className={c.className}>{c.render(row)}</td>
                  ))}
                  <td className="text-right whitespace-nowrap">
                    <button onClick={() => setEditing({ ...row })} className="mr-3 text-muted hover:text-text" aria-label={`Edit ${noun}`}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => setDeleting(row)} className="text-muted hover:text-danger" aria-label={`Delete ${noun}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <EmptyRow cols={columns.length + 1}>Nothing yet.</EmptyRow>
            )}
          </tbody>
        </Table>
      )}

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Edit ${noun.toLowerCase()}` : `New ${noun.toLowerCase()}`}
        className="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button loading={save.isPending} onClick={() => editing && save.mutate(editing)}>Save</Button>
          </>
        }
      >
        {editing && (
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <FormField key={f.name} def={f} value={editing[f.name]} onChange={(v) => setEditing({ ...editing, [f.name]: v })} />
            ))}
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete this ${noun.toLowerCase()}?`}
        danger
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      >
        <p className="text-sm text-muted">This can&apos;t be undone.</p>
      </ConfirmDialog>
    </>
  );
}

function FormField({ def, value, onChange }: { def: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const span = def.full || ["textarea", "lines", "image", "markdown"].includes(def.type ?? "") ? "sm:col-span-2" : "";
  switch (def.type) {
    case "checkbox":
      return <Checkbox className={`self-end ${span}`} label={def.label} checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;
    case "image":
      return <Field label={def.label} className={span}><ImageField value={(value as string) ?? null} onChange={onChange} label={def.label} /></Field>;
    case "lines":
      return <Field label={def.label} hint={def.hint ?? "One per line"} className={span}><LinesInput value={(value as string[]) ?? []} onChange={onChange} /></Field>;
    case "textarea":
    case "markdown":
      return (
        <Field label={def.label} hint={def.type === "markdown" ? "Markdown: ## headings, **bold**, - lists" : def.hint} className={span}>
          <Textarea rows={def.type === "markdown" ? 12 : 3} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={def.type === "markdown" ? "font-mono text-sm" : ""} />
        </Field>
      );
    case "select":
      return (
        <Field label={def.label} hint={def.hint} className={span}>
          <Select value={(value as string | number | null) ?? ""} onChange={(e) => onChange(e.target.value || null)}>
            {def.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
      );
    case "number":
      return <Field label={def.label} hint={def.hint} className={span}><Input type="number" step="any" value={(value as number | null) ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} /></Field>;
    case "date":
      return <Field label={def.label} hint={def.hint} className={span}><Input type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)} /></Field>;
    default:
      return <Field label={def.label} hint={def.hint} className={span}><Input required={def.required} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} /></Field>;
  }
}
