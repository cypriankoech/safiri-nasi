"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

export function AuthForm({ mode, next }: { mode: "login" | "register"; next?: string }) {
  const router = useRouter();
  const { setUser } = useSession();
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "" });
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user =
        mode === "login"
          ? await api<User>("/api/auth/login", { body: { email: form.email, password: form.password } })
          : await api<User>("/api/auth/register", { body: { ...form, phone: form.phone || null } });
      setUser(user);
      toast.success(mode === "login" ? `Welcome back, ${user.full_name.split(" ")[0]}!` : "Karibu! Your account is ready.");
      const fallback = user.role === "customer" ? "/account" : "/admin";
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : fallback);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {mode === "register" && (
        <>
          <Field label="Full name">
            <Input required minLength={2} autoComplete="name" value={form.full_name} onChange={set("full_name")} />
          </Field>
          <Field label="Phone (optional)">
            <Input type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} />
          </Field>
        </>
      )}
      <Field label="Email">
        <Input required type="email" autoComplete="email" value={form.email} onChange={set("email")} />
      </Field>
      <Field
        label="Password"
        hint={
          mode === "register" ? (
            "At least 8 characters"
          ) : (
            <Link href="/forgot-password" className="font-semibold text-primary underline">
              Forgot your password?
            </Link>
          )
        }
      >
        <Input
          required
          type="password"
          minLength={mode === "register" ? 8 : 1}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={form.password}
          onChange={set("password")}
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        {mode === "login" ? "Log in" : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted">
        {mode === "login" ? (
          <>
            New here? <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-primary underline">Create an account</Link>
          </>
        ) : (
          <>
            Already have an account? <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-primary underline">Log in</Link>
          </>
        )}
      </p>
    </form>
  );
}
