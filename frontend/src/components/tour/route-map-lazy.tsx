"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "../ui/misc";

// Leaflet touches `window`, so the map only renders in the browser.
export const RouteMapLazy = dynamic(() => import("./route-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-80 rounded-3xl md:h-96" />,
});
