import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/site/auth-form";
import { Container } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Container className="py-16">
      <div className="mx-auto max-w-md rounded-3xl border border-border bg-surface p-8 shadow-soft">
        <h1 className="text-3xl font-extrabold text-primary">Log in</h1>
        <p className="mt-1 mb-6 text-muted">See your trips, pay balances and download documents.</p>
        <Suspense fallback={<AuthForm mode="login" />}>
          <WithNext searchParams={searchParams} />
        </Suspense>
      </div>
    </Container>
  );
}

async function WithNext({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  return <AuthForm mode="login" next={typeof sp.next === "string" ? sp.next : undefined} />;
}
