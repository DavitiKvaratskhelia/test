"use client";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import type { Layers } from "@/components/FleetMap";
import { IconBox, IconCalendar, IconCircle, IconCopy, IconFilter, IconLayers, IconMenu, IconPin, IconRefresh, IconSearch, IconSort, IconUser } from "@/components/icons";
import { Avatar } from "@/components/kit";
import OrderModal from "@/components/OrderModal";
import { IconButton, StatusBadge, inputCls } from "@/components/ui";
import { can, useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { Courier, Order, Zone } from "@/lib/types";

const FleetMap = dynamic(() => import("@/components/FleetMap"), { ssr: false, loading: () => <div className="h-full animate-pulse bg-surface2" /> });
const DISPATCHED = ["assigned", "picked_up", "on_the_way"];
const PENDING = ["new", "ready"];
type DateF = "all" | "today" | "yesterday" | "7" | "30";

const inRange = (iso: string | null, f: DateF) => {
  if (f === "all" || !iso) return true;
  const d = new Date(iso), now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (f === "today") return d >= start;
  if (f === "yesterday") return d >= new Date(+start - 864e5) && d < start;
  return +now - +d <= Number(f) * 864e5;
};

function Card({ o, selected, onSelect, onOpen }: { o: Order; selected: boolean; onSelect: () => void; onOpen: () => void }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div onClick={onSelect} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onSelect()}
      className={`cursor-pointer rounded-2xl border bg-app px-5 py-4 text-sm transition hover:border-ink/30 ${selected ? "border-brand ring-2 ring-brand/30" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex gap-3"><IconCircle className="mt-0.5 shrink-0" /><div className="min-w-0"><div className="truncate text-muted">{o.pickup_branch || o.pickup_address || "—"}</div><div className="truncate font-semibold">{o.pickup_address || "—"}</div></div></div>
          <div className="flex gap-3"><IconPin className="mt-0.5 shrink-0" /><div className="min-w-0"><div className="truncate text-muted">{o.customer_name || "—"}</div><div className="truncate font-semibold">{o.delivery_address}</div></div></div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <button onClick={(e) => { e.stopPropagation(); onOpen(); }} className="flex items-center gap-1.5 rounded-xl bg-surface2 px-2.5 py-1.5 text-xs font-medium hover:bg-line" aria-label={t("open_details")} title={t("open_details")}>
              #{o.external_id}
              <span role="button" aria-label={t("copy_id")} onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(o.external_id).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => {}); }}>{copied ? "✓" : <IconCopy className="!h-3.5 !w-3.5 text-muted" />}</span>
            </button>
            <StatusBadge status={o.status} />
            {o.courier_name ? <Avatar name={o.courier_name} size={34} /> : <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-surface2 text-muted"><IconUser className="!h-4 !w-4" /></span>}
          </div>
        </div>
      </div>
      <div className="mt-2 flex justify-end text-xs text-muted">{o.created_at ? new Date(o.created_at).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }).replace(",", " /") : ""}</div>
    </div>
  );
}

function Active() {
  const { call, me } = useAuth();
  const { t } = useT();
  const [tab, setTab] = useState<"dispatched" | "pending">("dispatched");
  const [q, setQ] = useState(""); const [dateF, setDateF] = useState<DateF>("all");
  const [zoneF, setZoneF] = useState(""); const [filterOpen, setFilterOpen] = useState(false);
  const [asc, setAsc] = useState(false);
  const [railOpen, setRailOpen] = useState(false); const [courierF, setCourierF] = useState<number | null>(null);
  const [selId, setSelId] = useState<number | null>(null); const [modalId, setModalId] = useState<number | null>(null);
  const [layers, setLayers] = useState<Layers>({ zones: true, orders: true, couriers: true }); const [layersOpen, setLayersOpen] = useState(false);
  const [selCourier, setSelCourier] = useState<number | null>(null);
  const fleet = can.fleet(me?.role);
  const orders = useQuery({ queryKey: ["orders"], queryFn: () => call<Order[]>("/orders?limit=500"), refetchInterval: 15000 });
  const couriers = useQuery({ queryKey: ["couriers"], enabled: fleet, queryFn: () => call<Courier[]>("/fleet/couriers"), refetchInterval: 15000 });
  const zones = useQuery({ queryKey: ["zones"], enabled: fleet, queryFn: () => call<Zone[]>("/zones") });

  const all = orders.data ?? [];
  const dispatched = all.filter((o) => DISPATCHED.includes(o.status));
  const pending = all.filter((o) => PENDING.includes(o.status));
  const zoneNames = useMemo(() => [...new Set(all.map((o) => o.zone).filter(Boolean))].sort(), [all]);
  const rail = useMemo(() => { const m = new Map<number, { id: number; name: string; n: number }>(); dispatched.forEach((o) => { if (o.courier_id) { const e = m.get(o.courier_id) ?? { id: o.courier_id, name: o.courier_name ?? "", n: 0 }; e.n++; m.set(o.courier_id, e); } }); return [...m.values()]; }, [dispatched]);
  const list = (tab === "dispatched" ? dispatched : pending)
    .filter((o) => inRange(o.created_at, dateF) && (!zoneF || o.zone === zoneF) && (courierF == null || o.courier_id === courierF) &&
      (!q || [o.external_id, o.delivery_address, o.pickup_address, o.customer_name, o.zone].some((v) => v?.toLowerCase().includes(q.toLowerCase()))))
    .sort((a, b) => (asc ? 1 : -1) * ((a.created_at ?? "").localeCompare(b.created_at ?? "")));
  const sel = all.find((o) => o.id === selId) ?? null;

  return (
    <div className="flex min-h-0 flex-1 gap-4 px-4 pb-4 pt-4 lg:px-6">
      <aside className={`hidden shrink-0 flex-col gap-2 border-r pr-3 md:flex ${railOpen ? "w-52" : "w-[60px]"}`}>
        <button aria-label="menu" onClick={() => setRailOpen(!railOpen)} className="mb-2 flex h-10 items-center justify-center rounded-xl hover:bg-surface2"><IconMenu /></button>
        <button onClick={() => setCourierF(null)} className={`flex items-center gap-3 rounded-2xl p-1.5 ${courierF == null ? "bg-surface2" : "hover:bg-surface2"}`} title={t("dispatched_orders")}>
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-app"><IconBox /><span className="absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-solo px-1 text-[10px] font-bold text-white">{dispatched.length}</span></span>
          {railOpen && <span className="text-sm">{t("dispatched_orders")}</span>}
        </button>
        {rail.map((c) => (
          <button key={c.id} onClick={() => setCourierF(courierF === c.id ? null : c.id)} className={`flex items-center gap-3 rounded-2xl p-1.5 ${courierF === c.id ? "bg-surface2" : "hover:bg-surface2"}`} title={c.name}>
            <span className="relative shrink-0"><Avatar name={c.name} size={44} /><span className="absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-solo px-1 text-[10px] font-bold text-white">{c.n}</span></span>
            {railOpen && <span className="truncate text-sm">{c.name}</span>}
          </button>))}
      </aside>

      <section className="flex max-h-[55vh] w-full shrink-0 flex-col gap-3 md:max-h-none md:w-[440px] lg:w-[520px]">
        <div className="grid grid-cols-2 rounded-2xl border bg-surface2 p-1 text-sm">
          <button onClick={() => setTab("dispatched")} className={`rounded-xl py-2.5 ${tab === "dispatched" ? "bg-app font-medium shadow-sm" : "text-muted"}`}>{t("dispatched_orders")} ({dispatched.length})</button>
          <button onClick={() => setTab("pending")} className={`rounded-xl py-2.5 ${tab === "pending" ? "bg-app font-medium shadow-sm" : "text-muted"}`}>{t("pending_dispatch2")} <span className="text-red-600">({pending.length})</span></button>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1"><IconSearch className="pointer-events-none absolute left-3 top-1/2 !h-4 !w-4 -translate-y-1/2 text-muted" /><input className={`${inputCls} h-11 pl-9`} placeholder={t("search_order")} aria-label={t("search_order")} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="relative hidden w-36 xl:block"><IconCalendar className="pointer-events-none absolute left-3 top-1/2 !h-4 !w-4 -translate-y-1/2 text-muted" />
            <select className={`${inputCls} h-11 pl-9`} aria-label={t("by_date")} value={dateF} onChange={(e) => setDateF(e.target.value as DateF)}>
              <option value="all">{t("by_date")}</option><option value="today">{t("today")}</option><option value="yesterday">{t("yesterday")}</option><option value="7">{t("last7")}</option><option value="30">{t("last30")}</option></select></div>
          <IconButton label={t("conflict_reload")} className="!h-11 !w-11" onClick={() => orders.refetch()}><IconRefresh className="!h-4 !w-4" /></IconButton>
          <IconButton label={t("area")} className={`!h-11 !w-11 ${filterOpen || zoneF ? "!border-brand" : ""}`} onClick={() => setFilterOpen(!filterOpen)}><IconFilter className="!h-4 !w-4" /></IconButton>
          <IconButton label="sort" className="!h-11 !w-11" onClick={() => setAsc(!asc)}><IconSort className="!h-4 !w-4" /></IconButton>
        </div>
        {filterOpen && <div className="flex gap-2"><select className={inputCls} aria-label={t("area")} value={zoneF} onChange={(e) => setZoneF(e.target.value)}><option value="">{t("all_zones")}</option>{zoneNames.map((z) => <option key={z}>{z}</option>)}</select>
          <select className={`${inputCls} xl:hidden`} aria-label={t("by_date")} value={dateF} onChange={(e) => setDateF(e.target.value as DateF)}><option value="all">{t("by_date")}</option><option value="today">{t("today")}</option><option value="yesterday">{t("yesterday")}</option><option value="7">{t("last7")}</option><option value="30">{t("last30")}</option></select></div>}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {orders.isLoading && <p className="text-sm text-muted">{t("loading")}</p>}
          {orders.error && <p className="text-sm text-red-600">{String(orders.error)}</p>}
          {list.map((o) => <Card key={o.id} o={o} selected={selId === o.id} onSelect={() => setSelId(o.id)} onOpen={() => { setSelId(o.id); setModalId(o.id); }} />)}
          {!orders.isLoading && list.length === 0 && <p className="text-sm text-muted">{t("no_orders")}</p>}
        </div>
      </section>

      <section className="relative hidden min-h-[380px] flex-1 overflow-hidden rounded-2xl border md:block">
        <FleetMap couriers={couriers.data ?? []} orders={[...dispatched, ...pending]} zones={(zones.data ?? []).filter((z) => z.active)} layers={layers} selectedCourier={selCourier}
          onSelectCourier={(id) => { setSelId(null); setSelCourier(id); }} selectedOrder={sel} onSelectOrder={(o) => setSelId(o.id)} />
        {fleet && (
          <div className="absolute right-4 top-4 z-[1000]">
            <button className="flex h-10 items-center gap-2 rounded-xl border bg-pop px-3 text-sm shadow-md hover:bg-surface2" aria-expanded={layersOpen} onClick={() => setLayersOpen(!layersOpen)}><IconLayers className="!h-4 !w-4" />{t("layers")}</button>
            {layersOpen && (
              <div className="mt-2 w-52 space-y-2 rounded-xl border bg-pop p-3 text-sm shadow-xl">
                {([["couriers", t("nav_couriers")], ["orders", t("layer_orders")], ["zones", t("zones")]] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} />{label}</label>))}
              </div>)}
          </div>)}
      </section>
      {modalId != null && <OrderModal orderId={modalId} onClose={() => setModalId(null)} />}
    </div>
  );
}

export default function Page() {
  return <AppShell fullHeight><Active /></AppShell>;
}
