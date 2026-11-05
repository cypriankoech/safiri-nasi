import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/site/auth-form";
import { Container } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

export default function RegisterPage({ searchParams }: PageProps<"/register">) {
  return (
    <Container className="py-16">
      <div className="mx-auto max-w-md rounded-3xl border border-border bg-surface p-8 shadow-soft">
        <h1 className="text-3xl font-extrabold text-primary">Create an account</h1>
        <p className="mt-1 mb-6 text-muted">Keep all your trips in one place. Bookings you made with this email are added automatically.</p>
        <Suspense fallback={<AuthForm mode="register" />}>
          <WithNext searchParams={searchParams} />
        </Suspense>
      </div>
    </Container>
  );
}

async function WithNext({ searchParams }: { searchParams: PageProps<"/register">["searchParams"] }) {
  const sp = await searchParams;
  return <AuthForm mode="register" next={typeof sp.next === "string" ? sp.next : undefined} />;
}
