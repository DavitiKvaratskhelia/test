"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { TBILISI, TILE_ATTRIBUTION, TILE_URL } from "@/lib/map";

type Pt = { lat: number; lon: number } | null;

const pin = (fill: string, ring: boolean) => L.divIcon({
  className: "", iconSize: [22, 22], iconAnchor: [11, 11],
  html: `<div style="width:22px;height:22px;border-radius:50%;background:${ring ? "#fff" : fill};border:${ring ? `5px solid ${fill}` : "3px solid #fff"};box-shadow:0 1px 6px rgba(0,0,0,.4)"></div>`,
});

function Clicks({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function Fit({ from, to }: { from: Pt; to: Pt }) {
  const map = useMap();
  useEffect(() => {
    const pts = [from, to].filter(Boolean) as { lat: number; lon: number }[];
    if (pts.length === 2) map.fitBounds(pts.map((p) => [p.lat, p.lon] as [number, number]), { padding: [60, 60], maxZoom: 15 });
    else if (pts.length === 1) map.flyTo([pts[0].lat, pts[0].lon], Math.max(map.getZoom(), 14));
  }, [from?.lat, from?.lon, to?.lat, to?.lon, map]);  // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function OrderMap({ from, to, onPick }: { from: Pt; to: Pt; onPick: (lat: number, lon: number) => void }) {
  return (
    <MapContainer center={TBILISI} zoom={12} className="h-full w-full rounded-xl" style={{ cursor: "crosshair" }}>
      <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} maxZoom={19} />
      <Clicks onPick={onPick} /><Fit from={from} to={to} />
      {from && <Marker position={[from.lat, from.lon]} icon={pin("#0F172A", true)} />}
      {to && <Marker position={[to.lat, to.lon]} icon={pin("#F26A1B", false)} />}
      {from && to && <Polyline positions={[[from.lat, from.lon], [to.lat, to.lon]]} pathOptions={{ color: "#F26A1B", weight: 3, dashArray: "6 8" }} />}
    </MapContainer>
  );
}
