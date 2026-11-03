"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { CircleMarker, MapContainer, Polygon, Polyline, TileLayer, useMapEvents } from "react-leaflet";
import { TBILISI, TILE_ATTRIBUTION, TILE_URL } from "@/lib/map";
import type { Zone } from "@/lib/types";

function Clicks({ onAdd }: { onAdd: (p: [number, number]) => void }) {
  useMapEvents({ click: (e) => onAdd([e.latlng.lng, e.latlng.lat]) });  // stored as [lon, lat]
  return null;
}

/** Map with click-to-add-vertex drawing. `points` are [lon, lat]; `others` are existing zones shown for context. */
export default function ZoneEditor({ points, color, others, onAdd }: {
  points: number[][]; color: string; others: Zone[]; onAdd: (p: [number, number]) => void;
}) {
  const ll = points.map(([lon, lat]) => [lat, lon] as [number, number]);
  return (
    <MapContainer center={TBILISI} zoom={12} className="h-[55vh] w-full rounded-xl" scrollWheelZoom
      whenReady={() => { /* cursor hint */ }} style={{ cursor: "crosshair" }}>
      <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} maxZoom={19} />
      <Clicks onAdd={onAdd} />
      {others.map((z) => (
        <Polygon key={z.id} interactive={false} positions={z.polygon.map(([lon, lat]) => [lat, lon] as [number, number])}
          pathOptions={{ color: z.color, weight: 1, dashArray: "4", fillOpacity: 0.06 }} />
      ))}
      {ll.length >= 3 ? <Polygon positions={ll} pathOptions={{ color, weight: 3, fillOpacity: 0.25 }} /> : ll.length === 2 ? <Polyline positions={ll} pathOptions={{ color, weight: 3 }} /> : null}
      {ll.map((p, i) => <CircleMarker key={i} center={p} radius={5} pathOptions={{ color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 }} />)}
    </MapContainer>
  );
}
