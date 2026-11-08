"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/field";
import { api } from "@/lib/api";

async function upload(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await api<{ url: string }>("/api/admin/uploads", { form, method: "POST" });
  return res.url;
}

export function ImageField({ value, onChange, label = "Image" }: { value: string | null; onChange: (v: string | null) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await upload(file));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-start gap-3">
      <button type="button" onClick={() => ref.current?.click()} className="relative grid h-24 w-32 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-border bg-surface-2" aria-label={`Upload ${label}`}>
        {value ? <Image src={value} alt="" fill sizes="128px" className="object-cover" /> : busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-6 w-6 text-muted" />}
      </button>
      <div className="flex-1 space-y-2">
        <Input value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} placeholder="Upload or paste an image URL" className="text-sm" aria-label={`${label} URL`} />
        <p className="text-xs text-muted">JPG, PNG or WebP under 8 MB. Landscape photos at least 1600px wide look best.</p>
      </div>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}

export function GalleryField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const urls = [];
      for (const f of Array.from(files)) urls.push(await upload(f));
      onChange([...value, ...urls]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap gap-3">
      {value.map((src, i) => (
        <div key={src + i} className="relative h-24 w-32 overflow-hidden rounded-xl bg-surface-3">
          <Image src={src} alt="" fill sizes="128px" className="object-cover" />
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white" aria-label="Remove photo">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => ref.current?.click()} className="grid h-24 w-32 place-items-center rounded-xl border border-dashed border-border bg-surface-2 text-xs text-muted" aria-label="Add photos">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="flex flex-col items-center gap-1"><ImagePlus className="h-6 w-6" /> Add photos</span>}
      </button>
      <input ref={ref} type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" hidden onChange={(e) => pick(e.target.files)} />
    </div>
  );
}
