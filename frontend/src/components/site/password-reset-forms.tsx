"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      setSent((await api<{ message: string }>("/api/auth/forgot-password", { body: { email } })).message);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="rounded-2xl bg-success-bg p-5 text-sm text-success">
        <CheckCircle2 className="mb-2 h-6 w-6" />
        {sent} Check your inbox (and spam folder).
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email">
        <Input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Send reset link
      </Button>
      <p className="text-center text-sm text-muted">
        Remembered it? <Link href="/login" className="font-semibold text-primary underline">Back to log in</Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const { setUser } = useSession();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <p className="text-muted">
        This link is incomplete. <Link href="/forgot-password" className="font-semibold text-primary underline">Request a new one</Link>.
      </p>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("The passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const user = await api<User>("/api/auth/reset-password", { body: { token, password } });
      setUser(user);
      toast.success("Password updated. You're logged in.");
      router.push(user.role === "customer" ? "/account" : "/admin");
    } catch (err) {
      toast.error((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="New password" hint="At least 8 characters">
        <Input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Confirm new password">
        <Input required minLength={8} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Save new password
      </Button>
    </form>
  );
}
