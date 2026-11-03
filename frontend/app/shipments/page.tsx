"use client";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { StatusBadge, inputCls } from "@/components/ui";
import { can, useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { ageText, Courier, FRESH_COLOR, Freshness, MODEL_LABEL, Order, Zone } from "@/lib/types";

const FleetMap = dynamic(() => import("@/components/FleetMap"), { ssr: false, loading: () => <div className="h-full animate-pulse rounded-xl bg-line" /> });
const DISPATCHED = ["assigned", "picked_up"];
const PENDING = ["new", "ready"];

/** Progress derived from the current status only (status history is not exposed by the API yet, so no timestamps). */
function Stepper({ status }: { status: string }) {
  const { t } = useT();
  const steps = [["step_placed", 0], ["step_assigned", 1], ["step_transit", 2], ["step_delivered", 3]] as const;
  const idx = { new: 0, ready: 0, assigned: 1, picked_up: 2, delivered: 3 }[status as "new"] ?? -1;
  if (idx < 0) return <p className="text-sm text-muted">{t(`st_${status}` as Parameters<typeof t>[0])}</p>;
  return (
    <ol className="space-y-2">
      {steps.map(([k, i]) => (
        <li key={k} className={`flex items-center gap-3 text-sm ${i <= idx ? "" : "text-muted"}`}>
          <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] ${i < idx ? "border-solo bg-solo text-white" : i === idx ? "border-brand bg-brand text-white" : "border-line"}`}>{i < idx ? "✓" : ""}</span>{t(k)}
        </li>))}
    </ol>
  );
}

function OrderCard({ o, selected, onClick }: { o: Order; selected: boolean; onClick: () => void }) {
  const { t } = useT();
  return (
    <button onClick={onClick} className={`w-full rounded-xl border bg-surface p-3 text-left text-sm shadow-sm hover:border-brand ${selected ? "border-brand ring-2 ring-brand/30" : ""}`}>
      <div className="mb-2 flex items-center justify-between gap-2"><span className="rounded-md bg-surface2 px-2 py-0.5 text-xs">#{o.external_id}</span><StatusBadge status={o.status} /></div>
      <div className="flex gap-2">
        <div className="flex flex-col items-center pt-1"><i className="h-2.5 w-2.5 rounded-full border-2 border-muted" /><i className="my-0.5 h-5 w-px border-l border-dashed border-muted" /><i className="h-2.5 w-2.5 rounded-full bg-brand" /></div>
        <div className="min-w-0 flex-1 space-y-2"><div className="truncate text-muted">{o.pickup_address || "—"}</div><div className="truncate font-medium">{o.customer_name ? `${o.customer_name} · ` : ""}{o.delivery_address}</div></div>
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted"><span>{o.courier_name ?? t("unassigned_courier")}{o.zone ? ` · ${o.zone}` : ""}</span><span>{o.window_end ? new Date(o.window_end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span></div>
    </button>
  );
}

function Shipments() {
  const { call, me } = useAuth();
  const { t } = useT();
  const [tab, setTab] = useState<"dispatched" | "pending">("dispatched");
  const [q, setQ] = useState("");
  const [selCourier, setSelCourier] = useState<number | null>(null);
  const [selOrder, setSelOrder] = useState<Order | null>(null);
  const [showZones, setShowZones] = useState(true);
  const [hiddenZones, setHiddenZones] = useState<number[]>([]);
  const fleet = can.fleet(me?.role);
  const orders = useQuery({ queryKey: ["orders"], queryFn: () => call<Order[]>("/orders?limit=500"), refetchInterval: 15000 });
  const couriers = useQuery({ queryKey: ["couriers"], enabled: fleet, queryFn: () => call<Courier[]>("/fleet/couriers"), refetchInterval: 15000 });
  const zones = useQuery({ queryKey: ["zones"], enabled: fleet, queryFn: () => call<Zone[]>("/zones") });

  const all = orders.data ?? [];
  const dispatched = all.filter((o) => DISPATCHED.includes(o.status));
  const pending = all.filter((o) => PENDING.includes(o.status));
  const list = (tab === "dispatched" ? dispatched : pending).filter((o) => !q || [o.external_id, o.delivery_address, o.customer_name, o.zone].some((v) => v?.toLowerCase().includes(q.toLowerCase())));
  const cs = couriers.data ?? [];
  const counts = (["realtime", "delayed", "offline", "unknown"] as Freshness[]).map((f) => [f, cs.filter((c) => c.freshness === f).length] as const);
  const visibleZones = useMemo(() => showZones ? (zones.data ?? []).filter((z) => z.active && !hiddenZones.includes(z.id)) : [], [zones.data, showZones, hiddenZones]);
  const focus: [number, number] | null = selOrder?.delivery_lat != null && selOrder.delivery_lon != null ? [selOrder.delivery_lat, selOrder.delivery_lon] : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:flex-row">
      <section className="flex max-h-[50vh] w-full shrink-0 flex-col gap-3 md:max-h-none md:w-[400px]">
        <div className="grid grid-cols-2 rounded-xl border bg-surface2 p-1 text-sm">
          {([["dispatched", t("dispatched"), dispatched.length], ["pending", t("pending_dispatch"), pending.length]] as const).map(([k, label, n]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-lg py-2 ${tab === k ? "bg-surface font-medium shadow-sm" : "text-muted"}`}>{label} <span className={k === "pending" ? "text-red-500" : ""}>({n})</span></button>))}
        </div>
        <input className={inputCls} placeholder={t("search_order")} aria-label={t("search_order")} value={q} onChange={(e) => setQ(e.target.value)} />
        {selOrder && (
          <div className="rounded-xl border bg-surface p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{t("order_details")} #{selOrder.external_id}</h2><button aria-label={t("close")} className="text-muted" onClick={() => setSelOrder(null)}>✕</button></div>
            <Stepper status={selOrder.status} />
            <p className="mt-3 text-xs text-muted">{t("courier")}: {selOrder.courier_name ?? t("unassigned_courier")} · {selOrder.weight_kg} kg</p>
          </div>
        )}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {orders.isLoading && <p className="text-sm text-muted">{t("loading")}</p>}
          {list.map((o) => <OrderCard key={o.id} o={o} selected={selOrder?.id === o.id} onClick={() => setSelOrder(o)} />)}
          {!orders.isLoading && list.length === 0 && <p className="text-sm text-muted">{t("no_orders")}</p>}
        </div>
      </section>
      <section className="relative min-h-[360px] flex-1">
        <FleetMap couriers={cs} orders={[...dispatched, ...pending]} zones={visibleZones} selectedId={selCourier} onSelect={setSelCourier} focus={focus} />
        {fleet && (
          <div className="absolute right-3 top-3 z-[1000] w-56 space-y-2 rounded-xl border bg-surface/95 p-3 text-xs shadow">
            <div className="flex flex-wrap gap-x-3 gap-y-1">{counts.map(([f, n]) => <span key={f} className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: FRESH_COLOR[f] }} />{t(f)} {n}</span>)}</div>
            <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={showZones} onChange={(e) => setShowZones(e.target.checked)} />{t("show_zones")}</label>
            {showZones && (zones.data ?? []).map((z) => (
              <label key={z.id} className="flex items-center gap-2"><input type="checkbox" checked={!hiddenZones.includes(z.id)} onChange={() => setHiddenZones((h) => h.includes(z.id) ? h.filter((x) => x !== z.id) : [...h, z.id])} /><i className="h-2.5 w-2.5 rounded-sm" style={{ background: z.color }} />{z.name}</label>))}
            <div className="max-h-40 space-y-1 overflow-y-auto border-t pt-2">
              {cs.filter((c) => c.last_location).map((c) => (
                <button key={c.id} onClick={() => { setSelOrder(null); setSelCourier(c.id); }} className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-surface2 ${selCourier === c.id ? "bg-brand-light" : ""}`}>
                  <span className="flex h-5 w-5 items-center justify-center text-[10px] font-bold text-white" style={{ background: FRESH_COLOR[c.freshness], borderRadius: c.vehicle_type === "scooter" ? "50%" : 4 }}>{MODEL_LABEL[c.vehicle_model ?? ""]?.letter ?? "?"}</span>
                  <span className="min-w-0 flex-1 truncate">{c.full_name}</span><span className="text-muted">{ageText(c.age_seconds)}</span>
                </button>))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default function Page() {
  const { t } = useT();
  return <AppShell title={t("nav_map")} fullHeight><Shipments /></AppShell>;
}
