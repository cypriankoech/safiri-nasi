"use client";

import { CrudManager } from "@/components/admin/crud-manager";
import { PageHeader } from "@/components/admin/ui";
import { Badge } from "@/components/ui/misc";
import { fmtShortDate } from "@/lib/format";

export default function BlogAdminPage() {
  return (
    <>
      <PageHeader title="Blog" description="Travel stories and guides that help people find you on Google." />
      <CrudManager
        endpoint="/api/admin/blog"
        queryKey="blog"
        noun="Post"
        defaults={{ title: "", excerpt: "", body: "", cover_image: null, author_name: "Safiri Nasi Team", tags: [], status: "draft" }}
        toPayload={({ published_at: _p, updated_at: _u, slug, ...rest }) => ({ ...rest, slug: slug || null })}
        columns={[
          { label: "Title", render: (r) => <b>{String(r.title)}</b> },
          { label: "Published", render: (r) => fmtShortDate(r.published_at as string | null) || "—" },
          { label: "Status", render: (r) => <Badge tone={r.status === "published" ? "green" : "sun"}>{String(r.status)}</Badge> },
        ]}
        fields={[
          { name: "title", label: "Title", required: true, full: true },
          { name: "slug", label: "URL slug", hint: "Blank = auto" },
          { name: "author_name", label: "Author" },
          { name: "excerpt", label: "Excerpt", type: "textarea" },
          { name: "cover_image", label: "Cover photo", type: "image" },
          { name: "body", label: "Body", type: "markdown" },
          { name: "tags", label: "Tags", type: "lines" },
          { name: "status", label: "Status", type: "select", options: [{ value: "draft", label: "Draft" }, { value: "published", label: "Published" }] },
        ]}
      />
    </>
  );
}
