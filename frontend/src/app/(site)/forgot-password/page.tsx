import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/site/password-reset-forms";
import { Container } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <Container className="py-16">
      <div className="mx-auto max-w-md rounded-3xl border border-border bg-surface p-8 shadow-soft">
        <h1 className="text-3xl font-extrabold text-primary">Forgot your password?</h1>
        <p className="mt-1 mb-6 text-muted">Enter your email and we&apos;ll send you a link to choose a new one.</p>
        <ForgotPasswordForm />
      </div>
    </Container>
  );
}
