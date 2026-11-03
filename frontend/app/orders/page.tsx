"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { IconDownload } from "@/components/icons";
import { Avatar, Pagination } from "@/components/kit";
import { Button, Card, StatusBadge, inputCls } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { Order } from "@/lib/types";

const PAGE = 10;
const STATUSES = ["new", "ready", "assigned", "picked_up", "delivered", "failed", "returned", "cancelled"];

/** CSV cell: quote everything and neutralise spreadsheet formulas (=,+,-,@) injected via customer-controlled text. */
const cell = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

function Orders() {
  const { call } = useAuth();
  const { t } = useT();
  const [status, setStatus] = useState(""); const [zone, setZone] = useState(""); const [courier, setCourier] = useState(""); const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<number[]>([]);
  useEffect(() => { try { setQ(new URLSearchParams(window.location.search).get("q") ?? ""); } catch {} }, []);
  const { data, isLoading, error } = useQuery({ queryKey: ["orders"], queryFn: () => call<Order[]>("/orders?limit=500"), refetchInterval: 20000 });

  const all = data ?? [];
  const zones = useMemo(() => [...new Set(all.map((o) => o.zone).filter(Boolean))].sort(), [all]);
  const couriers = useMemo(() => [...new Set(all.map((o) => o.courier_name).filter(Boolean) as string[])].sort(), [all]);
  const rows = all.filter((o) => (!status || o.status === status) && (!zone || o.zone === zone) && (!courier || o.courier_name === courier) &&
    (!q || [o.external_id, o.customer_name, o.delivery_address, o.zone].some((v) => v?.toLowerCase().includes(q.toLowerCase()))));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  useEffect(() => setPage(0), [status, zone, courier, q]);

  const exportCsv = () => {
    const src = sel.length ? rows.filter((o) => sel.includes(o.id)) : rows;
    const head = ["order_id", "customer", "address", "status", "courier", "zone", "weight_kg", "created_at"];
    const lines = [head.map(cell).join(",")].concat(src.map((o) => [o.external_id, o.customer_name, o.delivery_address, o.status, o.courier_name, o.zone, o.weight_kg, o.created_at].map(cell).join(",")));
    const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "orders.csv"; a.click(); URL.revokeObjectURL(url);
  };
  const allOnPage = shown.length > 0 && shown.every((o) => sel.includes(o.id));

  return (
    <main className="space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted">{t("status")}<select className={`${inputCls} mt-1 w-44`} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{t("all_status")}</option>{STATUSES.map((s) => <option key={s} value={s}>{t(`st_${s}` as Parameters<typeof t>[0])}</option>)}</select></label>
        <label className="text-xs text-muted">{t("zone")}<select className={`${inputCls} mt-1 w-44`} value={zone} onChange={(e) => setZone(e.target.value)}><option value="">{t("all_zones")}</option>{zones.map((z) => <option key={z}>{z}</option>)}</select></label>
        <label className="text-xs text-muted">{t("courier")}<select className={`${inputCls} mt-1 w-52`} value={courier} onChange={(e) => setCourier(e.target.value)}><option value="">{t("all_couriers")}</option>{couriers.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="text-xs text-muted">{t("search")}<input className={`${inputCls} mt-1 w-52`} value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <Button variant="dark" className="ml-auto flex items-center gap-2" onClick={exportCsv}><IconDownload className="!h-4 !w-4" />{t("export_csv")}{sel.length ? ` (${sel.length})` : ""}</Button>
      </div>
      {error && <p className="text-sm text-red-600">{String(error)}</p>}
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs text-muted">
            <tr>
              <th className="w-10 p-3"><input type="checkbox" aria-label="select page" checked={allOnPage} onChange={() => setSel(allOnPage ? sel.filter((id) => !shown.some((o) => o.id === id)) : [...new Set([...sel, ...shown.map((o) => o.id)])])} /></th>
              <th>{t("col_order")}</th><th>{t("col_customer")}</th><th>{t("status")}</th><th>{t("courier")}</th><th>{t("zone")}</th><th>{t("col_date")}</th><th className="pr-3 text-right">{t("weight")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="p-4 text-muted">{t("loading")}</td></tr>}
            {shown.map((o) => (
              <tr key={o.id} className="border-b last:border-0 hover:bg-surface2">
                <td className="p-3"><input type="checkbox" aria-label={`select ${o.external_id}`} checked={sel.includes(o.id)} onChange={() => setSel(sel.includes(o.id) ? sel.filter((x) => x !== o.id) : [...sel, o.id])} /></td>
                <td className="font-medium">#{o.external_id}</td>
                <td><span className="flex items-center gap-2"><Avatar name={o.customer_name || o.delivery_address} /><span className="min-w-0"><span className="block max-w-[220px] truncate">{o.customer_name || "—"}</span><span className="block max-w-[220px] truncate text-xs text-muted">{o.delivery_address}</span></span></span></td>
                <td><StatusBadge status={o.status} /></td>
                <td className="text-muted">{o.courier_name ?? t("unassigned_courier")}</td>
                <td className="text-muted">{o.zone || "—"}</td>
                <td className="whitespace-nowrap text-muted">{o.created_at ? new Date(o.created_at).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                <td className="pr-3 text-right">{o.weight_kg} kg</td>
              </tr>))}
            {!isLoading && shown.length === 0 && <tr><td colSpan={8} className="p-4 text-muted">{t("no_orders")}</td></tr>}
          </tbody>
        </table>
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <span>{t("showing", { a: rows.length ? page * PAGE + 1 : 0, b: Math.min(rows.length, (page + 1) * PAGE), n: rows.length })}{sel.length ? ` · ${t("selected_n", { n: sel.length })}` : ""}</span>
        <Pagination page={page} pages={pages} onPage={setPage} />
      </div>
    </main>
  );
}

export default function Page() {
  const { t } = useT();
  return <AppShell title={t("nav_orders")}><Orders /></AppShell>;
}
