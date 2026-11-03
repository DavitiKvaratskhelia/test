"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { ageText, Courier, FRESH_COLOR, MODEL_LABEL, OrderPoint } from "@/app/types";

const TBILISI: [number, number] = [41.7151, 44.8271];

function courierIcon(c: Courier, selected: boolean) {
  const color = FRESH_COLOR[c.freshness];
  const letter = MODEL_LABEL[c.vehicle_model ?? ""]?.letter ?? "?";
  const stale = c.freshness === "offline";
  // offline positions are drawn hollow/dashed + translucent so they never look "live"
  const style = `width:28px;height:28px;border-radius:${c.vehicle_type === "scooter" ? "50%" : "6px"};
    background:${stale ? "#fff" : color};color:${stale ? "#6b7280" : "#fff"};border:2px ${stale ? "dashed" : "solid"} ${stale ? "#6b7280" : "#fff"};
    box-shadow:0 0 0 ${selected ? 3 : 1}px ${selected ? "#F26A1B" : color};opacity:${stale ? 0.7 : 1};
    display:flex;align-items:center;justify-content:center;font:700 13px system-ui`;
  return L.divIcon({ className: "", html: `<div style="${style}">${letter}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
}

const orderIcon = L.divIcon({
  className: "", iconSize: [12, 12], iconAnchor: [6, 6],
  html: `<div style="width:12px;height:12px;background:#F26A1B;border:2px solid #fff;transform:rotate(45deg);box-shadow:0 0 0 1px #C9520E"></div>`,
});

function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => { if (target) map.flyTo(target, Math.max(map.getZoom(), 14), { duration: 0.6 }); }, [target, map]);
  return null;
}

export default function FleetMap({ couriers, orders, selectedId, onSelect }: {
  couriers: Courier[]; orders: OrderPoint[]; selectedId: number | null; onSelect: (id: number) => void;
}) {
  const sel = couriers.find((c) => c.id === selectedId)?.last_location;
  return (
    <MapContainer center={TBILISI} zoom={12} className="h-full w-full rounded-lg" scrollWheelZoom>
      {/* OSM public tile server: fine for development/low volume. For production use a tile provider or self-host. */}
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
      <FlyTo target={sel ? [sel.lat, sel.lon] : null} />
      {orders.filter((o) => o.delivery_lat != null && o.delivery_lon != null).map((o) => (
        <Marker key={`o${o.id}`} position={[o.delivery_lat!, o.delivery_lon!]} icon={orderIcon}>
          <Popup><b>{o.external_id}</b> · {o.status}<br />{o.delivery_address}<br />{o.weight_kg} kg{o.is_simulated && <><br /><i>simulated</i></>}</Popup>
        </Marker>
      ))}
      {couriers.filter((c) => c.last_location).map((c) => (
        <Marker key={`c${c.id}`} position={[c.last_location!.lat, c.last_location!.lon]}
          icon={courierIcon(c, c.id === selectedId)} eventHandlers={{ click: () => onSelect(c.id) }}>
          <Popup>
            <b>{c.full_name}</b><br />
            {MODEL_LABEL[c.vehicle_model ?? ""]?.name ?? "—"} · {c.plate}<br />
            GPS: <b style={{ color: FRESH_COLOR[c.freshness] }}>{c.freshness}</b> ({ageText(c.age_seconds)})
            {c.freshness === "offline" && <><br /><i>Last known position — not current</i></>}
            {c.is_simulated && <><br /><i>simulated data</i></>}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
