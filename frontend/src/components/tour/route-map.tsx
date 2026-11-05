"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet";
import type { MapPoint } from "@/lib/types";

function pin(label: string) {
  return L.divIcon({
    className: "",
    html: `<span style="display:grid;place-items:center;width:30px;height:30px;border-radius:999px;background:#1e3b1c;color:#fff;font:700 12px var(--font-body),sans-serif;border:3px solid #7dc242;box-shadow:0 4px 10px rgba(0,0,0,.25)">${label}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export default function RouteMap({ points }: { points: MapPoint[] }) {
  const positions = points.map((p) => [p.lat, p.lng] as [number, number]);
  const bounds = L.latLngBounds(positions).pad(0.25);
  return (
    <MapContainer
      bounds={positions.length > 1 ? bounds : undefined}
      center={positions.length === 1 ? positions[0] : undefined}
      zoom={positions.length === 1 ? 9 : undefined}
      scrollWheelZoom={false}
      className="h-80 w-full rounded-3xl md:h-96"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {positions.length > 1 && <Polyline positions={positions} pathOptions={{ color: "#f29f1d", weight: 4, dashArray: "8 8" }} />}
      {points.map((p, i) => (
        <Marker key={`${p.name}-${i}`} position={[p.lat, p.lng]} icon={pin(String(i + 1))}>
          <Popup>
            <b>{p.name}</b>
            {p.day ? <div>Day {p.day}</div> : null}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
