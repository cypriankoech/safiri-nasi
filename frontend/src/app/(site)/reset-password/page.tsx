import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/site/password-reset-forms";
import { Container, Skeleton } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  return (
    <Container className="py-16">
      <div className="mx-auto max-w-md rounded-3xl border border-border bg-surface p-8 shadow-soft">
        <h1 className="text-3xl font-extrabold text-primary">Choose a new password</h1>
        <p className="mt-1 mb-6 text-muted">You&apos;ll be logged in straight away.</p>
        <Suspense fallback={<Skeleton className="h-48" />}>
          <WithToken searchParams={searchParams} />
        </Suspense>
      </div>
    </Container>
  );
}

async function WithToken({ searchParams }: { searchParams: PageProps<"/reset-password">["searchParams"] }) {
  const sp = await searchParams;
  return <ResetPasswordForm token={typeof sp.token === "string" ? sp.token : ""} />;
}
