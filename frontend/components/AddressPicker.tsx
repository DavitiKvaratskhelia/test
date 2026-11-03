"use client";
import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, TileLayer, useMapEvents } from "react-leaflet";
import { TBILISI, TILE_ATTRIBUTION, TILE_URL } from "@/lib/map";

function Clicks({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function AddressPicker({ value, onPick }: { value: { lat: number; lon: number } | null; onPick: (lat: number, lon: number) => void }) {
  return (
    <MapContainer center={value ? [value.lat, value.lon] : TBILISI} zoom={value ? 15 : 11} className="h-56 w-full rounded-xl" style={{ cursor: "crosshair" }}>
      <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} maxZoom={19} />
      <Clicks onPick={onPick} />
      {value && <CircleMarker center={[value.lat, value.lon]} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: "#F26A1B", fillOpacity: 1 }} />}
    </MapContainer>
  );
}
