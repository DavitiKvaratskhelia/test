"use client";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { IconCopy, IconDownload, IconFilter, IconLayers, IconPlus, IconSearch, IconX } from "@/components/icons";
import OrderCard from "@/components/OrderCard";
import { IconButton, PillTabs, StatusBadge, inputCls } from "@/components/ui";
import type { Layers } from "@/components/FleetMap";
import { can, useAuth } from "@/lib/auth";
import { downloadCsv } from "@/lib/csv";
import { useT } from "@/lib/i18n";
import type { Courier, Order, Zone } from "@/lib/types";

const FleetMap = dynamic(() => import("@/components/FleetMap"), { ssr: false, loading: () => <div className="h-full animate-pulse bg-surface2" /> });
type Tab = "all" | "pending" | "transit" | "delivered";
const GROUPS: Record<Exclude<Tab, "all">, string[]> = { pending: ["new", "ready"], transit: ["assigned", "picked_up"], delivered: ["delivered"] };

/** Progress derived from the current status only (status history is not exposed by the API yet, so no per-step timestamps). */
function Timeline({ o }: { o: Order }) {
  const { t } = useT();
  const idx = ({ new: 0, ready: 0, assigned: 1, picked_up: 2, delivered: 3 } as Record<string, number>)[o.status] ?? -1;
  const steps = [
    { k: t("step_placed"), sub: o.pickup_address || "—", when: o.created_at ? new Date(o.created_at).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "" },
    { k: t("step_assigned"), sub: o.courier_name ?? t("unassigned_courier"), when: "" },
    { k: t("step_transit"), sub: o.delivery_address, when: "" },
    { k: t("step_delivered"), sub: o.delivery_address, when: "" },
  ];
  if (idx < 0) return <div className="flex items-center gap-2 text-sm"><StatusBadge status={o.status} /></div>;
  return (
    <ol className="relative space-y-5">
      {steps.map((s, i) => (
        <li key={s.k} className="relative flex gap-3">
          {i < steps.length - 1 && <i className={`absolute left-[5px] top-4 h-[calc(100%+4px)] w-px ${i < idx ? "bg-sky-500" : "border-l border-dashed border-muted/50"}`} />}
          <i className={`relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full ${i < idx ? "bg-sky-500" : i === idx ? "bg-brand ring-4 ring-brand/20" : "border-2 border-line bg-app"}`} />
          <div className={`min-w-0 text-sm ${i <= idx ? "" : "text-muted"}`}><div className="font-semibold">{s.k}</div><div className="truncate text-muted">{s.sub}</div>{s.when && i <= idx && <div className="text-xs text-muted/80">{s.when}</div>}</div>
        </li>))}
    </ol>
  );
}

function Details({ o, onClose }: { o: Order; onClose: () => void }) {
  const { t } = useT();
  const [tab, setTab] = useState<"info" | "track">("track");
  const [copied, setCopied] = useState(false);
  const rows: [string, React.ReactNode][] = [
    [t("status"), <StatusBadge key="s" status={o.status} />], [t("created"), o.created_at ? new Date(o.created_at).toLocaleString() : "—"],
    [t("pickup_loc"), o.pickup_address || "—"], [t("delivery_loc"), o.delivery_address], [t("customer"), o.customer_name || "—"],
    [t("phone"), o.customer_phone || "—"], [t("courier"), o.courier_name ?? t("unassigned_courier")], [t("weight"), `${o.weight_kg} kg`], [t("zone"), o.zone || "—"],
  ];
  return (
    <div className="absolute left-4 top-4 z-[1000] w-[340px] max-w-[calc(100%-2rem)] rounded-2xl border bg-pop p-4 shadow-xl" aria-label={t("order_details")}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">No: #{o.external_id}</span>
        <span className="flex items-center gap-1">
          <button aria-label={t("copy_id")} title={copied ? t("copied") : t("copy_id")} className="rounded-lg p-1.5 text-muted hover:bg-surface2" onClick={() => { navigator.clipboard?.writeText(o.external_id).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}><IconCopy className="!h-4 !w-4" /></button>
          <button aria-label={t("close")} className="rounded-lg p-1.5 text-muted hover:bg-surface2" onClick={onClose}><IconX className="!h-4 !w-4" /></button>
        </span>
      </div>
      <div className="mb-4"><PillTabs value={tab} onChange={setTab} tabs={[{ id: "info", label: t("order_info") }, { id: "track", label: t("tracking") }]} /></div>
      {tab === "track" ? <Timeline o={o} /> : (
        <dl className="space-y-2.5 text-sm">{rows.map(([k, v], i) => <div key={i} className="flex justify-between gap-4"><dt className="shrink-0 text-muted">{k}</dt><dd className="min-w-0 break-words text-right font-medium">{v}</dd></div>)}</dl>
      )}
      <p className="mt-3 text-[11px] text-muted">{t("guide_line")}</p>
    </div>
  );
}

function Tracking() {
  const { call, me } = useAuth();
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [zoneFilter, setZoneFilter] = useState(""); const [showFilter, setShowFilter] = useState(false);
  const [selCourier, setSelCourier] = useState<number | null>(null);
  const [selOrder, setSelOrder] = useState<Order | null>(null);
  const [layers, setLayers] = useState<Layers>({ zones: true, orders: true, couriers: true });
  const [hiddenZones, setHiddenZones] = useState<number[]>([]);
  const [layersOpen, setLayersOpen] = useState(false);
  const fleet = can.fleet(me?.role);
  const orders = useQuery({ queryKey: ["orders"], queryFn: () => call<Order[]>("/orders?limit=500"), refetchInterval: 15000 });
  const couriers = useQuery({ queryKey: ["couriers"], enabled: fleet, queryFn: () => call<Courier[]>("/fleet/couriers"), refetchInterval: 15000 });
  const zones = useQuery({ queryKey: ["zones"], enabled: fleet, queryFn: () => call<Zone[]>("/zones") });

  const open = (orders.data ?? []).filter((o) => !["cancelled", "returned"].includes(o.status));
  const count = (k: Tab) => k === "all" ? open.length : open.filter((o) => GROUPS[k].includes(o.status)).length;
  const list = open.filter((o) => (tab === "all" || GROUPS[tab].includes(o.status)) && (!zoneFilter || o.zone === zoneFilter) &&
    (!q || [o.external_id, o.delivery_address, o.customer_name, o.zone].some((v) => v?.toLowerCase().includes(q.toLowerCase()))));
  const zoneNames = useMemo(() => [...new Set(open.map((o) => o.zone).filter(Boolean))].sort(), [open]);
  const visibleZones = useMemo(() => (zones.data ?? []).filter((z) => z.active && !hiddenZones.includes(z.id)), [zones.data, hiddenZones]);
  const focus: [number, number] | null = selOrder?.delivery_lat != null && selOrder.delivery_lon != null ? [selOrder.delivery_lat, selOrder.delivery_lon] : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 pb-5 md:flex-row">
      <section className="flex max-h-[55vh] w-full shrink-0 flex-col gap-3 md:max-h-none md:w-[400px]">
        <div className="flex gap-2">
          <div className="relative flex-1"><IconSearch className="pointer-events-none absolute left-3 top-1/2 !h-4 !w-4 -translate-y-1/2 text-muted" /><input className={`${inputCls} pl-9`} placeholder={t("search_order")} aria-label={t("search_order")} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <IconButton label={t("export_csv")} className="!h-10 !w-10" onClick={() => downloadCsv("tracking.csv", [["order_id", "customer", "address", "status", "courier", "zone"], ...list.map((o) => [o.external_id, o.customer_name, o.delivery_address, o.status, o.courier_name, o.zone])])}><IconDownload className="!h-4 !w-4" /></IconButton>
          <IconButton label={t("zone")} className={`!h-10 !w-10 ${showFilter || zoneFilter ? "!border-brand" : ""}`} onClick={() => setShowFilter(!showFilter)}><IconFilter className="!h-4 !w-4" /></IconButton>
        </div>
        {showFilter && <select className={inputCls} aria-label={t("zone")} value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)}><option value="">{t("all_zones")}</option>{zoneNames.map((z) => <option key={z}>{z}</option>)}</select>}
        <PillTabs value={tab} onChange={setTab} tabs={[
          { id: "all", label: t("tab_all"), count: count("all") }, { id: "pending", label: t("kpi_pending"), count: count("pending") },
          { id: "transit", label: t("kpi_transit"), count: count("transit") }, { id: "delivered", label: t("kpi_delivered"), count: count("delivered") }]} />
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {orders.isLoading && <p className="text-sm text-muted">{t("loading")}</p>}
          {list.map((o) => <OrderCard key={o.id} o={o} selected={selOrder?.id === o.id} onClick={() => setSelOrder(o)} onLocate={() => setSelOrder(o)} />)}
          {!orders.isLoading && list.length === 0 && <p className="text-sm text-muted">{t("no_orders")}</p>}
        </div>
        {can.createOrder(me?.role) && <Link href="/orders/new" className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-solo text-sm font-medium text-white hover:bg-solo-hover"><IconPlus className="!h-4 !w-4" />{t("add_order")}</Link>}
      </section>

      <section className="relative min-h-[380px] flex-1 overflow-hidden rounded-2xl border">
        <FleetMap couriers={couriers.data ?? []} orders={open} zones={visibleZones} layers={layers} selectedCourier={selCourier}
          onSelectCourier={(id) => { setSelOrder(null); setSelCourier(id); }} selectedOrder={selOrder} onSelectOrder={setSelOrder} focus={focus} />
        {selOrder && <Details key={selOrder.id} o={selOrder} onClose={() => setSelOrder(null)} />}
        {fleet && (
          <div className="absolute right-4 top-4 z-[1000] flex items-start gap-2">
            <div className="rounded-xl border bg-pop p-1 text-sm shadow-md"><span className="block rounded-lg bg-brand px-4 py-1.5 text-xs font-semibold text-brand-on">{t("map_tab")}</span></div>
            <div className="relative">
              <button className="flex h-10 items-center gap-2 rounded-xl border bg-pop px-3 text-sm shadow-md hover:bg-surface2" aria-expanded={layersOpen} onClick={() => setLayersOpen(!layersOpen)}><IconLayers className="!h-4 !w-4" />{t("layers")}</button>
              {layersOpen && (
                <div className="absolute right-0 mt-2 w-56 space-y-2 rounded-xl border bg-pop p-3 text-sm shadow-xl">
                  {([["couriers", t("nav_couriers")], ["orders", t("layer_orders")], ["zones", t("zones")]] as const).map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} />{label}</label>))}
                  {layers.zones && (zones.data ?? []).map((z) => (
                    <label key={z.id} className="ml-5 flex items-center gap-2 text-xs"><input type="checkbox" checked={!hiddenZones.includes(z.id)} onChange={() => setHiddenZones((h) => h.includes(z.id) ? h.filter((x) => x !== z.id) : [...h, z.id])} /><i className="h-2.5 w-2.5 rounded-sm" style={{ background: z.color }} />{z.name}</label>))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default function Page() {
  const { t } = useT();
  return <AppShell title={t("nav_map")} fullHeight><Tracking /></AppShell>;
}
