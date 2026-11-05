"use client";

import { Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export function ReviewForm({ slug, reference, token }: { slug: string; reference: string; token?: string }) {
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api<{ message: string }>(`/api/tours/${slug}/reviews`, {
        body: { booking_reference: reference, token, email: token ? undefined : email, rating, title, body },
      });
      toast.success(res.message);
      setDone(true);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return <p className="rounded-2xl bg-success-bg p-5 font-semibold text-success">Asante! Your review has been submitted.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl border border-lime bg-surface p-6">
      <p className="text-lg font-bold">How was your trip? (booking {reference})</p>
      <div className="flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} stars`} onClick={() => setRating(n)}>
            <Star className={cn("h-8 w-8", n <= rating ? "fill-sun text-sun" : "text-border")} />
          </button>
        ))}
      </div>
      {!token && (
        <Field label="Email used for the booking">
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      )}
      <Field label="Headline">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Saw a river crossing!" maxLength={160} />
      </Field>
      <Field label="Your review">
        <Textarea required minLength={10} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What did you love? Any tips for other travellers?" />
      </Field>
      <Button type="submit" loading={loading}>
        Submit review
      </Button>
    </form>
  );
}
