"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { clipPoster, clipSrc, type TripClip } from "@/lib/media";
import { cn } from "@/lib/utils";

/** Autoplays muted while on screen and pauses when scrolled away, so only visible clips download. */
function Clip({ clip, className }: { clip: TripClip; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(true);
  const [userPaused, setUserPaused] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !reduceMotion && !userPaused) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.4 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [userPaused]);

  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) {
      setUserPaused(false);
      video.play().catch(() => {});
    } else {
      setUserPaused(true);
      video.pause();
    }
  };

  return (
    <figure className={cn("group relative overflow-hidden rounded-3xl bg-forest-deep", className)}>
      <video
        ref={ref}
        src={clipSrc(clip.slug)}
        poster={clipPoster(clip.slug)}
        muted
        loop
        playsInline
        preload="none"
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        className="h-full w-full object-cover"
        aria-label={clip.caption}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-forest-deep/85 via-transparent to-transparent" />
      <figcaption className="absolute inset-x-0 bottom-0 p-4 pr-14 text-sm font-semibold text-white">{clip.caption}</figcaption>
      <button
        onClick={toggle}
        className="absolute right-3 bottom-3 grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white backdrop-blur transition hover:bg-white/35"
        aria-label={paused ? `Play: ${clip.caption}` : `Pause: ${clip.caption}`}
      >
        {paused ? <Play className="h-4 w-4 fill-current" /> : <Pause className="h-4 w-4 fill-current" />}
      </button>
    </figure>
  );
}

/** Bento-style grid: landscape clips span two columns, portrait clips two rows. */
export function VideoReel({ clips }: { clips: TripClip[] }) {
  return (
    <div className="grid grid-flow-dense auto-rows-[220px] grid-cols-2 gap-4 md:auto-rows-[200px] md:grid-cols-4">
      {clips.map((clip) => (
        <Clip
          key={clip.slug}
          clip={clip}
          className={cn(
            clip.orientation === "landscape" && "col-span-2",
            clip.orientation === "portrait" && "row-span-2",
            clip.orientation === "square" && "col-span-1 row-span-1 md:col-span-2 md:row-span-2",
          )}
        />
      ))}
    </div>
  );
}
