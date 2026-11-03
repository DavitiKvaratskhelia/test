"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { TBILISI, TILE_ATTRIBUTION, TILE_URL } from "@/lib/map";
import { ageText, Courier, FRESH_COLOR, MODEL_LABEL, Order, Zone } from "@/lib/types";
import { IconLocate, IconMinus, IconPlus } from "./icons";

// Inline SVG glyphs (static strings — no user data is ever interpolated into marker HTML).
const TRUCK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6h11v10H2zM13 10h4l4 3v3h-8z"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/></svg>';
const SCOOTER = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="17" r="2.6"/><circle cx="18" cy="17" r="2.6"/><path d="M6 17h6l2-9h3M12 17l-1-5h-3"/></svg>';
const ARROW_DOWN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14m0 0-5-5m5 5 5-5"/></svg>';
const ARROW_UP = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5m0 0-5 5m5-5 5 5"/></svg>';

/** Dark round pin with a vehicle glyph (reference style) + a freshness dot. Offline pins are faded/dashed so they never look live. */
function courierIcon(c: Courier, selected: boolean) {
  const stale = c.freshness === "offline" || c.freshness === "unknown";
  const bg = selected ? "#2563EB" : "#171A21";
  const glyph = c.vehicle_type === "scooter" ? SCOOTER : TRUCK;
  const html = `<div style="position:relative;width:38px;height:38px;opacity:${stale ? 0.6 : 1}">
    <div style="width:38px;height:38px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;border:2px ${stale ? "dashed #9ca3af" : "solid #fff"};box-shadow:0 2px 8px rgba(0,0,0,.35)">${glyph}</div>
    <span style="position:absolute;right:-2px;bottom:-2px;width:13px;height:13px;border-radius:50%;background:${FRESH_COLOR[c.freshness]};border:2px solid #fff"></span></div>`;
  return L.divIcon({ className: "", html, iconSize: [38, 38], iconAnchor: [19, 19] });
}

const chip = (arrow: string, selected: boolean) => L.divIcon({
  className: "", iconSize: [30, 30], iconAnchor: [15, 15],
  html: `<div style="width:30px;height:30px;border-radius:10px;background:#fff;color:#171A21;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.3);border:${selected ? "2px solid #2563EB" : "1px solid rgba(0,0,0,.12)"}">${arrow}</div>`,
});

function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => { if (target) map.flyTo(target, Math.max(map.getZoom(), 14), { duration: 0.6 }); }, [target, map]);
  return null;
}

/** Frame both ends of the selected order, leaving room for the floating details card on the left. */
function FitOrder({ pickup, drop }: { pickup: [number, number] | null; drop: [number, number] | null }) {
  const map = useMap();
  const key = `${pickup?.join()}|${drop?.join()}`;
  useEffect(() => {
    if (pickup && drop) map.fitBounds([pickup, drop], { paddingTopLeft: [380, 70], paddingBottomRight: [90, 70], maxZoom: 15 });
    else if (drop) map.flyTo(drop, Math.max(map.getZoom(), 14), { duration: 0.6 });
  }, [key, map]);  // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export type Layers = { zones: boolean; orders: boolean; couriers: boolean };

export default function FleetMap({ couriers, orders, zones, layers, selectedCourier, onSelectCourier, selectedOrder, onSelectOrder, focus }: {
  couriers: Courier[]; orders: Order[]; zones: Zone[]; layers: Layers; selectedCourier: number | null; onSelectCourier: (id: number) => void;
  selectedOrder: Order | null; onSelectOrder: (o: Order) => void; focus?: [number, number] | null;
}) {
  const map = useRef<L.Map | null>(null);
  const sel = couriers.find((c) => c.id === selectedCourier)?.last_location;
  const so = selectedOrder;
  const pickup: [number, number] | null = so?.pickup_lat != null && so.pickup_lon != null ? [so.pickup_lat, so.pickup_lon] : null;
  const drop: [number, number] | null = so?.delivery_lat != null && so.delivery_lon != null ? [so.delivery_lat, so.delivery_lon] : null;

  const fitAll = () => {
    const pts = couriers.filter((c) => c.last_location).map((c) => [c.last_location!.lat, c.last_location!.lon] as [number, number])
      .concat(orders.filter((o) => o.delivery_lat != null).map((o) => [o.delivery_lat!, o.delivery_lon!] as [number, number]));
    if (pts.length && map.current) map.current.fitBounds(pts, { padding: [60, 60], maxZoom: 14 });
  };

  return (
    <div className="relative h-full w-full">
      <MapContainer ref={map} center={TBILISI} zoom={12} zoomControl={false} className="h-full w-full" scrollWheelZoom>
        <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} maxZoom={19} />
        {so ? <FitOrder pickup={pickup} drop={drop} /> : <FlyTo target={focus ?? (sel ? [sel.lat, sel.lon] : null)} />}
        {layers.zones && zones.map((z) => (
          <Polygon key={`z${z.id}`} positions={z.polygon.map(([lon, lat]) => [lat, lon] as [number, number])} pathOptions={{ color: z.color, weight: 2, fillOpacity: 0.1 }}><Tooltip sticky>{z.name}</Tooltip></Polygon>
        ))}
        {/* Straight guide line between the selected order's pickup and drop-off — NOT a road route. */}
        {pickup && drop && <Polyline positions={[pickup, drop]} pathOptions={{ color: "#171A21", weight: 3, dashArray: "6 8" }} />}
        {layers.orders && orders.filter((o) => o.delivery_lat != null && o.delivery_lon != null && o.id !== so?.id).map((o) => (
          <Marker key={`o${o.id}`} position={[o.delivery_lat!, o.delivery_lon!]} icon={chip(ARROW_DOWN, false)} eventHandlers={{ click: () => onSelectOrder(o) }} />
        ))}
        {pickup && <Marker position={pickup} icon={chip(ARROW_UP, true)}><Tooltip permanent direction="right" offset={[16, 0]}>{so?.pickup_address}</Tooltip></Marker>}
        {drop && so && <Marker position={drop} icon={chip(ARROW_DOWN, true)}><Tooltip permanent direction="right" offset={[16, 0]}>{so.delivery_address}</Tooltip></Marker>}
        {layers.couriers && couriers.filter((c) => c.last_location).map((c) => (
          <Marker key={`c${c.id}`} position={[c.last_location!.lat, c.last_location!.lon]} icon={courierIcon(c, c.id === selectedCourier)} eventHandlers={{ click: () => onSelectCourier(c.id) }}>
            <Popup>
              <b>{c.full_name}</b><br />{MODEL_LABEL[c.vehicle_model ?? ""]?.name ?? "—"} · {c.plate}<br />
              GPS: <b style={{ color: FRESH_COLOR[c.freshness] }}>{c.freshness}</b> ({ageText(c.age_seconds)})
              {c.freshness === "offline" && <><br /><i>Last known position — not current</i></>}
              {c.is_simulated && <><br /><i>simulated data</i></>}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <div className="absolute bottom-4 right-4 z-[1000] flex flex-col gap-2">
        <button className="mapbtn" aria-label="fit all" onClick={fitAll}><IconLocate /></button>
        <div className="flex flex-col overflow-hidden rounded-xl border bg-pop shadow-md">
          <button className="flex h-10 w-10 items-center justify-center hover:bg-surface2" aria-label="zoom in" onClick={() => map.current?.zoomIn()}><IconPlus /></button>
          <button className="flex h-10 w-10 items-center justify-center border-t hover:bg-surface2" aria-label="zoom out" onClick={() => map.current?.zoomOut()}><IconMinus /></button>
        </div>
      </div>
    </div>
  );
}
