"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { IconCalendar, IconCircle, IconCopy, IconDots, IconDownload, IconExternal, IconPin, IconPlus, IconRefresh, IconSearch, IconSort, IconUser } from "@/components/icons";
import { Avatar, OrderProgress, Pagination } from "@/components/kit";
import OrderModal from "@/components/OrderModal";
import { IconButton, StatusBadge, inputCls } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { downloadCsv } from "@/lib/csv";
import { useT } from "@/lib/i18n";
import type { Order } from "@/lib/types";

const PAGE = 20;
const TABS = ["all", "ready", "assigned", "picked_up", "on_the_way", "delivered", "cancelled", "failed"] as const;
type SortKey = "distance" | "price" | "status" | "created" | "courier";
type DateF = "all" | "today" | "yesterday" | "7" | "30";

const inRange = (iso: string | null, f: DateF) => {
  if (f === "all" || !iso) return true;
  const d = new Date(iso), now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (f === "today") return d >= start;
  if (f === "yesterday") return d >= new Date(+start - 864e5) && d < start;
  return +now - +d <= Number(f) * 864e5;
};

function History() {
  const { call } = useAuth();
  const { t } = useT();
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const [q, setQ] = useState(""); const [courier, setCourier] = useState(""); const [zone, setZone] = useState(""); const [dateF, setDateF] = useState<DateF>("all");
  const [sort, setSort] = useState<{ k: SortKey; asc: boolean }>({ k: "created", asc: false });
  const [page, setPage] = useState(0); const [open, setOpen] = useState<number | null>(null);
  useEffect(() => { try { setQ(new URLSearchParams(window.location.search).get("q") ?? ""); } catch {} }, []);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["orders"], queryFn: () => call<Order[]>("/orders?limit=500"), refetchInterval: 20000 });

  const all = data ?? [];
  const couriers = useMemo(() => [...new Set(all.map((o) => o.courier_name).filter(Boolean) as string[])].sort(), [all]);
  const zones = useMemo(() => [...new Set(all.map((o) => o.zone).filter(Boolean))].sort(), [all]);
  const filtered = all.filter((o) => (!courier || o.courier_name === courier) && (!zone || o.zone === zone) && inRange(o.created_at, dateF) &&
    (!q || [o.external_id, o.customer_name, o.delivery_address, o.pickup_address, o.zone].some((v) => v?.toLowerCase().includes(q.toLowerCase()))));
  const counts = (k: (typeof TABS)[number]) => k === "all" ? filtered.length : filtered.filter((o) => o.status === k).length;   // counts follow the same filters as the table
  const rows = filtered.filter((o) => tab === "all" || o.status === tab).sort((a, b) => {
    const v = (o: Order) => sort.k === "distance" ? o.distance_m ?? -1 : sort.k === "price" ? o.price ?? -1 : sort.k === "status" ? o.status : sort.k === "courier" ? o.courier_name ?? "" : o.created_at ?? "";
    const x = v(a), y = v(b);
    return (sort.asc ? 1 : -1) * (x < y ? -1 : x > y ? 1 : 0);
  });
  useEffect(() => setPage(0), [tab, q, courier, zone, dateF]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const Th = ({ k, label, right }: { k?: SortKey; label: string; right?: boolean }) => (
    <th className={`px-3 py-3 font-medium ${right ? "text-right" : ""}`}>{k ? <button className="inline-flex items-center gap-1" onClick={() => setSort({ k, asc: sort.k === k ? !sort.asc : true })}>{label}<IconSort className={`!h-3.5 !w-3.5 ${sort.k === k ? "text-ink" : "text-muted"}`} /></button> : label}</th>);

  return (
    <main className="space-y-5 px-6 pb-8 pt-4 lg:px-9">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("nav_orders")}</h1>
        <div className="flex flex-wrap gap-2">
          <div className="relative"><IconSearch className="pointer-events-none absolute left-3 top-1/2 !h-4 !w-4 -translate-y-1/2 text-muted" /><input className={`${inputCls} h-11 w-56 pl-9`} placeholder={t("search_ph")} aria-label={t("search")} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="relative"><IconUser className="pointer-events-none absolute left-3 top-1/2 !h-4 !w-4 -translate-y-1/2 text-muted" /><select className={`${inputCls} h-11 w-44 pl-9`} aria-label={t("by_courier")} value={courier} onChange={(e) => setCourier(e.target.value)}><option value="">{t("by_courier")}</option>{couriers.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="relative"><IconCalendar className="pointer-events-none absolute left-3 top-1/2 !h-4 !w-4 -translate-y-1/2 text-muted" /><select className={`${inputCls} h-11 w-40 pl-9`} aria-label={t("by_date")} value={dateF} onChange={(e) => setDateF(e.target.value as DateF)}>
            <option value="all">{t("by_date")}</option><option value="today">{t("today")}</option><option value="yesterday">{t("yesterday")}</option><option value="7">{t("last7")}</option><option value="30">{t("last30")}</option></select></div>
          <div className="relative"><IconPin className="pointer-events-none absolute left-3 top-1/2 !h-4 !w-4 -translate-y-1/2 text-muted" /><select className={`${inputCls} h-11 w-36 pl-9`} aria-label={t("area")} value={zone} onChange={(e) => setZone(e.target.value)}><option value="">{t("area")}</option>{zones.map((z) => <option key={z}>{z}</option>)}</select></div>
          <IconButton label={t("conflict_reload")} className="!h-11 !w-11" onClick={() => refetch()}><IconRefresh className="!h-4 !w-4" /></IconButton>
          <IconButton label={t("export_csv")} className="!h-11 !w-11" onClick={() => downloadCsv("orders.csv", [["order_id", "pickup", "delivery", "distance_km_straight_line", "price", "status", "created_at", "courier", "zone"],
            ...rows.map((o) => [o.external_id, o.pickup_address, o.delivery_address, o.distance_m != null ? (o.distance_m / 1000).toFixed(2) : "", o.price ?? "", o.status, o.created_at, o.courier_name, o.zone])])}><IconDownload className="!h-4 !w-4" /></IconButton>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((k) => (
          <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k} className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm ${tab === k ? "border-ink bg-app font-semibold" : "text-ink hover:bg-surface2"}`}>
            {k === "all" ? t("all_orders") : t(`st_${k}` as Parameters<typeof t>[0])}
            <span className={`rounded-full px-2 py-0.5 text-xs ${tab === k ? "bg-solo text-white" : "border"}`}>{counts(k)}</span>
          </button>))}
      </div>
      {error && <p className="text-sm text-red-600">{String(error)}</p>}

      <div className="overflow-x-auto rounded-2xl border bg-surface">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="text-xs text-ink"><tr>
            <Th label={t("col_id")} /><Th label={t("col_route")} /><Th k="distance" label={t("col_distance")} /><Th k="price" label={t("col_price")} /><Th label={t("col_events")} /><Th k="status" label={t("col_status")} /><Th k="created" label={t("col_created")} /><Th k="courier" label={t("col_courier")} /><th className="w-10" />
          </tr></thead>
          <tbody className="bg-app">
            {isLoading && <tr><td colSpan={9} className="p-5 text-muted">{t("loading")}</td></tr>}
            {shown.map((o) => (
              <tr key={o.id} onClick={() => setOpen(o.id)} className="cursor-pointer border-t hover:bg-surface">
                <td className="px-3 py-4 align-top"><div className="flex items-center gap-1.5 font-medium">#{o.external_id}<IconCopy className="!h-3.5 !w-3.5 text-muted" /></div>
                  <TrackingLink orderId={o.id} /></td>
                <td className="px-3 py-4"><div className="space-y-2">
                  <div className="flex items-center gap-2"><IconCircle className="!h-4 !w-4 shrink-0 text-muted" /><span className="max-w-[300px] truncate">{o.pickup_address || "—"}</span></div>
                  <div className="flex items-center gap-2"><IconCircle className="!h-4 !w-4 shrink-0 text-muted" /><span className="max-w-[300px] truncate">{o.delivery_address}</span></div></div></td>
                <td className="px-3 py-4 font-medium" title={t("straight_line")}>{o.distance_m != null ? `${(o.distance_m / 1000).toFixed(2)} km` : "—"}</td>
                <td className="px-3 py-4 font-medium">{o.price != null ? o.price.toFixed(2) : "—"}</td>
                <td className="px-3 py-4"><OrderProgress status={o.status} /></td>
                <td className="px-3 py-4"><StatusBadge status={o.status} /></td>
                <td className="px-3 py-4 text-xs"><div className="font-medium">{o.created_at ? new Date(o.created_at).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }) : ""}</div><div className="text-muted">{o.created_at ? new Date(o.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</div></td>
                <td className="px-3 py-4">{o.courier_name ? <span className="flex items-center gap-2"><Avatar name={o.courier_name} size={28} /><span className="max-w-[140px] truncate">{o.courier_name}</span></span>
                  : <span className="inline-flex items-center gap-1.5 rounded-xl bg-solo px-4 py-2 text-xs font-medium text-white"><IconPlus className="!h-3.5 !w-3.5" />{t("assign")}</span>}</td>
                <td className="px-3 py-4 text-muted"><IconDots /></td>
              </tr>))}
            {!isLoading && shown.length === 0 && <tr><td colSpan={9} className="p-5 text-muted">{t("no_orders")}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <span>{t("showing", { a: rows.length ? page * PAGE + 1 : 0, b: Math.min(rows.length, (page + 1) * PAGE), n: rows.length })}</span>
        <Pagination page={page} pages={pages} onPage={setPage} />
      </div>
      {open != null && <OrderModal orderId={open} onClose={() => setOpen(null)} />}
    </main>
  );
}

/** "Tracking ↗": creates (or reuses) the customer link on demand, then opens it. */
function TrackingLink({ orderId }: { orderId: number }) {
  const { call } = useAuth();
  const { t } = useT();
  return (
    <button onClick={async (e) => { e.stopPropagation(); try { const r = await call<{ token: string }>(`/orders/${orderId}/links`, { method: "POST" }); window.open(`/track/${r.token}`, "_blank", "noopener"); } catch {} }}
      className="mt-2 inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100 dark:bg-sky-500/15 dark:text-sky-300">{t("tracking_link")}<IconExternal className="!h-3.5 !w-3.5" /></button>
  );
}

export default function Page() { return <AppShell><History /></AppShell>; }
