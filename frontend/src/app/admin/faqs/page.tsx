"use client";

import { CrudManager } from "@/components/admin/crud-manager";
import { PageHeader } from "@/components/admin/ui";
import { Badge } from "@/components/ui/misc";

export default function FaqsAdminPage() {
  return (
    <>
      <PageHeader title="FAQs" description="Shown on the FAQ page, grouped by category." />
      <CrudManager
        endpoint="/api/admin/faqs"
        queryKey="faqs"
        noun="FAQ"
        defaults={{ question: "", answer: "", category: "General", sort_order: 0, active: true }}
        columns={[
          { label: "Question", render: (r) => <b>{String(r.question)}</b> },
          { label: "Category", render: (r) => String(r.category) },
          { label: "Shown", render: (r) => <Badge tone={r.active ? "green" : "neutral"}>{r.active ? "Yes" : "Hidden"}</Badge> },
        ]}
        fields={[
          { name: "question", label: "Question", required: true, full: true },
          { name: "answer", label: "Answer", type: "textarea" },
          { name: "category", label: "Category" },
          { name: "sort_order", label: "Sort order", type: "number" },
          { name: "active", label: "Show on site", type: "checkbox" },
        ]}
      />
    </>
  );
}
