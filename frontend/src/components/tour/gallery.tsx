"use client";

import { ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

export function Gallery({ images, title }: { images: string[]; title: string }) {
  const [index, setIndex] = useState<number | null>(null);
  const close = () => setIndex(null);
  const step = useCallback(
    (d: number) => setIndex((i) => (i === null ? i : (i + d + images.length) % images.length)),
    [images.length],
  );

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIndex(null);
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [index, step]);

  if (!images.length) return null;
  const [main, ...rest] = images;

  return (
    <>
      <div className="grid h-[300px] gap-2 overflow-hidden rounded-3xl sm:h-[420px] md:grid-cols-[2fr_1fr] lg:h-[480px]">
        <button className="relative overflow-hidden bg-surface-3" onClick={() => setIndex(0)} aria-label="Open photo 1">
          <Image src={main} alt={title} fill preload sizes="(min-width: 768px) 66vw, 100vw" className="object-cover transition hover:scale-[1.02]" />
        </button>
        <div className="hidden grid-rows-2 gap-2 md:grid">
          {rest.slice(0, 2).map((src, i) => (
            <button key={src} className="relative overflow-hidden bg-surface-3" onClick={() => setIndex(i + 1)} aria-label={`Open photo ${i + 2}`}>
              <Image src={src} alt="" fill sizes="33vw" className="object-cover transition hover:scale-[1.03]" />
              {i === 1 && images.length > 3 && (
                <span className="absolute inset-0 grid place-items-center bg-forest-deep/50 text-lg font-bold text-white">
                  +{images.length - 3} photos
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      {images.length > 1 && (
        <button
          onClick={() => setIndex(0)}
          className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary md:hidden"
        >
          <Images className="h-4 w-4" /> View all {images.length} photos
        </button>
      )}

      {index !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90" role="dialog" aria-modal="true" aria-label="Photo viewer">
          <button onClick={close} className="absolute top-4 right-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white" aria-label="Close">
            <X className="h-6 w-6" />
          </button>
          <button onClick={() => step(-1)} className="absolute left-3 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white" aria-label="Previous photo">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div className="relative h-[80vh] w-[92vw]">
            <Image src={images[index]} alt={`${title} photo ${index + 1}`} fill sizes="92vw" className="object-contain" />
          </div>
          <button onClick={() => step(1)} className="absolute right-3 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white" aria-label="Next photo">
            <ChevronRight className="h-6 w-6" />
          </button>
          <p className="absolute bottom-4 text-sm text-white/70">
            {index + 1} / {images.length}
          </p>
        </div>
      )}
    </>
  );
}
