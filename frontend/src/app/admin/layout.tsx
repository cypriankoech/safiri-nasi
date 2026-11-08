import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Skeleton } from "@/components/ui/misc";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | Safiri Nasi Admin" }, robots: { index: false } };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<Skeleton className="m-8 h-96" />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
