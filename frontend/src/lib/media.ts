// Safiri Nasi's own trip footage in /public/media/videos (muted, trimmed clips with poster frames).

export interface TripClip {
  slug: string;
  caption: string;
  orientation: "landscape" | "portrait" | "square";
  destinations: string[];
}

export const TRIP_CLIPS: TripClip[] = [
  { slug: "leopard-on-game-track", caption: "A leopard strolls past on the game track", orientation: "portrait", destinations: [] },
  { slug: "elephant-herd-dry-lakebed", caption: "An elephant herd crossing a dry lake bed", orientation: "landscape", destinations: ["amboseli"] },
  { slug: "bull-elephant-approaching", caption: "Face to face with a big tusker", orientation: "portrait", destinations: [] },
  { slug: "safari-vehicles-fording-river", caption: "Splashing through a river crossing after the rains", orientation: "landscape", destinations: [] },
  { slug: "mara-river-rekero-crossing", caption: "The Mara River in flood at Rekero crossing", orientation: "portrait", destinations: ["maasai-mara"] },
  { slug: "elephant-crossing-river", caption: "A young elephant wades across the river", orientation: "square", destinations: [] },
];

export const clipSrc = (slug: string) => `/media/videos/${slug}.mp4`;
export const clipPoster = (slug: string) => `/media/videos/${slug}.webp`;
