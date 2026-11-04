"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import { TILE_ATTRIBUTION, TILE_URL } from "@/lib/map";

const icon = L.divIcon({ className: "", iconSize: [26, 26], iconAnchor: [13, 13], html: '<div style="width:26px;height:26px;border-radius:50%;background:#F26A1B;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>' });

/** Read-only map with one marker (the courier's live position on the customer tracking page). */
export default function MiniMap({ lat, lon }: { lat: number; lon: number }) {
  return (
    <MapContainer center={[lat, lon]} zoom={15} className="h-56 w-full rounded-2xl" scrollWheelZoom={false}>
      <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} maxZoom={19} />
      <Marker position={[lat, lon]} icon={icon} />
    </MapContainer>
  );
}
