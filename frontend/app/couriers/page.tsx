"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { IconBicycle, IconCar, IconPlus, IconScooter, IconSearch, IconTruckBig, IconVan, IconWalk } from "@/components/icons";
import { Avatar } from "@/components/kit";
import { Button, ErrorText, Field, Modal, inputCls } from "@/components/ui";
import { can, useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { Courier, FRESH_COLOR, Order, Transport, TRANSPORTS } from "@/lib/types";

const FleetMap = dynamic(() => import("@/components/FleetMap"), { ssr: false, loading: () => <div className="h-full animate-pulse bg-surface2" /> });
const ICON: Record<Transport, (p: { className?: string }) => React.ReactElement> = { pedestrian: IconWalk, bicycle: IconBicycle, scooter: IconScooter, combo: IconVan, car: IconCar, truck: IconTruckBig };
const DEFAULT_KG: Record<Transport, number> = { pedestrian: 10, bicycle: 15, scooter: 25, combo: 600, car: 300, truck: 1500 };

type Draft = { first_name: string; last_name: string; email: string; phone: string; transport: Transport; capacity_kg: string; capacity_m3: string; active: boolean };

function CourierModal({ courier, onClose }: { courier?: Courier; onClose: () => void }) {
  const { call } = useAuth();
  const { t } = useT();
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>({
    first_name: courier?.first_name ?? "", last_name: courier?.last_name ?? "", email: courier?.email ?? "", phone: courier?.phone || "+995 ",
    transport: (courier?.transport as Transport) ?? "car", capacity_kg: courier?.capacity_kg ? String(courier.capacity_kg) : "",
    capacity_m3: courier?.capacity_volume_l ? String(courier.capacity_volume_l / 1000) : "", active: courier?.active ?? true,
  });
  const save = useMutation({
    mutationFn: () => call(courier ? `/fleet/couriers/${courier.id}` : "/fleet/couriers", {
      method: courier ? "PUT" : "POST",
      body: JSON.stringify({ ...d, phone: d.phone.trim() === "+995" ? "" : d.phone, capacity_kg: d.capacity_kg === "" ? null : Number(d.capacity_kg), capacity_m3: d.capacity_m3 === "" ? null : Number(d.capacity_m3) }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["couriers"] }); onClose(); },
  });
  return (
    <Modal title={courier ? t("edit_courier") : t("add_courier_title")} onClose={onClose} wide>
      <form className="grid gap-6 md:grid-cols-[240px_1fr]" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div>
          <p className="mb-2 text-sm font-medium">{t("transport_type")}:</p>
          <div className="space-y-2" role="radiogroup">
            {TRANSPORTS.map((k) => { const Ic = ICON[k]; const on = d.transport === k; return (
              <button type="button" key={k} role="radio" aria-checked={on} onClick={() => setD({ ...d, transport: k })}
                className={`flex w-full items-center gap-3 rounded-full border px-4 py-2.5 text-sm ${on ? "border-brand bg-brand font-semibold text-brand-on" : "bg-app hover:bg-surface2"}`}><Ic className="!h-5 !w-5" />{t(`tr_${k}` as Parameters<typeof t>[0])}</button>); })}
          </div>
          <p className="mt-3 text-xs text-muted">{t("transport_note")}</p>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("first_name")}><input className={inputCls} required value={d.first_name} onChange={(e) => setD({ ...d, first_name: e.target.value })} /></Field>
            <Field label={t("last_name")}><input className={inputCls} value={d.last_name} onChange={(e) => setD({ ...d, last_name: e.target.value })} /></Field>
          </div>
          <Field label={t("email_opt")}><input className={inputCls} type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></Field>
          <Field label={t("phone")}><input className={inputCls} inputMode="tel" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`${t("transport_volume")} (kg)`}><input className={inputCls} type="number" min={0} step="any" placeholder={String(DEFAULT_KG[d.transport])} value={d.capacity_kg} onChange={(e) => setD({ ...d, capacity_kg: e.target.value })} /></Field>
            <Field label={`${t("transport_volume")} (m³)`}><input className={inputCls} type="number" min={0} step="any" value={d.capacity_m3} onChange={(e) => setD({ ...d, capacity_m3: e.target.value })} /></Field>
          </div>
          <div className="flex items-center justify-between rounded-2xl border bg-surface p-3 text-sm">
            <span>{t("courier_status")}: <b className={d.active ? "text-emerald-600" : "text-muted"}>{d.active ? t("active_u") : t("inactive_u")}</b></span>
            <button type="button" role="switch" aria-checked={d.active} aria-label={t("courier_status")} onClick={() => setD({ ...d, active: !d.active })} className={`h-7 w-12 rounded-full p-0.5 transition ${d.active ? "bg-solo" : "bg-line"}`}><i className={`block h-6 w-6 rounded-full bg-white transition ${d.active ? "translate-x-5" : ""}`} /></button>
          </div>
          <ErrorText error={save.error} />
          <Button className="h-12 w-full tracking-wide" disabled={save.isPending}>{t("save")}</Button>
        </div>
      </form>
    </Modal>
  );
}

function Couriers() {
  const { call, me } = useAuth();
  const { t } = useT();
  const [tab, setTab] = useState<"list" | "analytics">("list");
  const [q, setQ] = useState(""); const [status, setStatus] = useState(""); const [transport, setTransport] = useState(""); const [online, setOnline] = useState(false); const [mapView, setMapView] = useState(false);
  const [edit, setEdit] = useState<{ courier?: Courier } | null>(null);
  const manage = can.manageSettings(me?.role);
  const { data, isLoading, error } = useQuery({ queryKey: ["couriers", "all"], queryFn: () => call<Courier[]>("/fleet/couriers?include_inactive=true"), refetchInterval: 15000 });
  const orders = useQuery({ queryKey: ["orders"], queryFn: () => call<Order[]>("/orders?limit=500") });
  const rows = (data ?? []).filter((c) => (!q || [c.full_name, c.email, c.phone].some((v) => v?.toLowerCase().includes(q.toLowerCase()))) &&
    (!status || (status === "active") === c.active) && (!transport || c.transport === transport) && (!online || c.freshness === "realtime" || c.freshness === "delayed"));
  const stats = useMemo(() => (data ?? []).map((c) => {
    const mine = (orders.data ?? []).filter((o) => o.courier_id === c.id);
    return { c, progress: mine.filter((o) => ["assigned", "picked_up", "on_the_way"].includes(o.status)).length, delivered: mine.filter((o) => o.status === "delivered").length, failed: mine.filter((o) => o.status === "failed").length };
  }), [data, orders.data]);

  return (
    <main className="space-y-4 px-6 pb-8 pt-4 lg:px-9">
      <div className="flex items-end justify-between border-b">
        <div className="flex gap-6">
          {(["list", "analytics"] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 pb-3 text-2xl font-bold ${tab === k ? "border-ink text-ink" : "border-transparent text-muted"}`}>{k === "list" ? t("couriers_title") : t("nav_analytics")}</button>))}
        </div>
        {manage && <Button className="mb-2 tracking-wide" onClick={() => setEdit({})}><IconPlus className="!h-4 !w-4" />{t("add_courier")}</Button>}
      </div>
      {tab === "analytics" ? (
        <div className="overflow-x-auto rounded-2xl border bg-app"><table className="w-full text-left text-sm">
          <caption className="p-4 text-left font-semibold">{t("deliveries_per_courier")}</caption>
          <thead className="border-y bg-surface text-xs"><tr><th className="p-3">{t("courier")}</th><th>{t("in_progress")}</th><th>{t("delivered_n")}</th><th>{t("failed_n")}</th></tr></thead>
          <tbody>{stats.map(({ c, progress, delivered, failed }) => <tr key={c.id} className="border-b last:border-0"><td className="p-3">{c.full_name}</td><td>{progress}</td><td>{delivered}</td><td>{failed}</td></tr>)}</tbody></table></div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative"><IconSearch className="pointer-events-none absolute left-3 top-1/2 !h-4 !w-4 -translate-y-1/2 text-muted" /><input className={`${inputCls} h-11 w-64 pl-9`} placeholder={t("search_ph")} aria-label={t("search")} value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <select className={`${inputCls} h-11 !w-40`} aria-label={t("status_all")} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{t("status_all")}</option><option value="active">{t("active")}</option><option value="inactive">{t("inactive")}</option></select>
            <select className={`${inputCls} h-11 !w-44`} aria-label={t("transport_all")} value={transport} onChange={(e) => setTransport(e.target.value)}><option value="">{t("transport_all")}</option>{TRANSPORTS.map((k) => <option key={k} value={k}>{t(`tr_${k}` as Parameters<typeof t>[0])}</option>)}</select>
            <label className="flex h-11 items-center gap-2 rounded-xl border px-3 text-sm">{t("online")}<input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} /></label>
            <label className="ml-auto flex h-11 items-center gap-2 rounded-xl border px-3 text-sm">{t("map_toggle")}<input type="checkbox" checked={mapView} onChange={(e) => setMapView(e.target.checked)} /></label>
          </div>
          {error && <p className="text-sm text-red-600">{String(error)}</p>}
          {mapView ? (
            <div className="h-[60vh] overflow-hidden rounded-2xl border"><FleetMap couriers={rows} orders={[]} zones={[]} layers={{ zones: false, orders: false, couriers: true }} selectedCourier={null} onSelectCourier={() => {}} selectedOrder={null} onSelectOrder={() => {}} /></div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-app">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b bg-surface text-xs"><tr><th className="px-4 py-3">{t("name")}</th><th>{t("email")}</th><th>{t("phone")}</th><th>{t("transport")}</th><th>{t("status")}</th><th /></tr></thead>
                <tbody>
                  {isLoading && <tr><td colSpan={6} className="p-5 text-muted">{t("loading")}</td></tr>}
                  {rows.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="px-4 py-3"><div className="flex items-center gap-3"><span className="relative"><Avatar name={c.full_name} size={40} /><i className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white" style={{ background: FRESH_COLOR[c.freshness] }} /></span>
                        <span><span className="block font-semibold">{c.full_name}{c.is_simulated && <span className="ml-2 rounded bg-brand-light px-1.5 text-[10px] text-brand-text">sim</span>}</span>
                          <span className="block text-[11px] uppercase text-muted">{t("last_gps")}: {c.last_seen ? new Date(c.last_seen).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }) : t("no_gps_time")}</span></span></div></td>
                      <td className="text-muted">{c.email || "—"}</td><td className="text-muted">{c.phone || "—"}</td>
                      <td>{c.transport ? <span className="inline-flex items-center gap-2">{(() => { const Ic = ICON[c.transport as Transport]; return Ic ? <Ic className="!h-4 !w-4" /> : null; })()}{t(`tr_${c.transport}` as Parameters<typeof t>[0])}</span> : "—"}</td>
                      <td><span className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${c.active ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "text-muted"}`}>{c.active ? t("active_u") : t("inactive_u")}</span></td>
                      <td className="pr-4 text-right">{manage && <button className="rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-surface2" onClick={() => setEdit({ courier: c })}>{t("edit_btn")}</button>}</td>
                    </tr>))}
                  {!isLoading && rows.length === 0 && <tr><td colSpan={6} className="p-5 text-muted">{t("no_orders")}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {edit && <CourierModal key={edit.courier?.id ?? "new"} courier={edit.courier} onClose={() => setEdit(null)} />}
    </main>
  );
}

export default function Page() { return <AppShell><Couriers /></AppShell>; }
