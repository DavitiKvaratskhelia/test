"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";
import AppShell from "@/components/AppShell";
import BarChart from "@/components/BarChart";
import { IconAlert, IconBox, IconCheck, IconClock, IconMap, IconOrders, IconPlus, IconSettings, IconTruck } from "@/components/icons";
import { Avatar, KpiCard } from "@/components/kit";
import { Card, StatusBadge } from "@/components/ui";
import { can, useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { Courier, Order } from "@/lib/types";

const OPEN = ["new", "ready", "assigned", "picked_up"];

function Dashboard() {
  const { call, me } = useAuth();
  const { t } = useT();
  const fleet = can.fleet(me?.role);
  const orders = useQuery({ queryKey: ["orders"], queryFn: () => call<Order[]>("/orders?limit=500"), refetchInterval: 20000 });
  const couriers = useQuery({ queryKey: ["couriers"], enabled: fleet, queryFn: () => call<Courier[]>("/fleet/couriers"), refetchInterval: 20000 });
  const all = orders.data ?? [];
  const count = (s: string[]) => all.filter((o) => s.includes(o.status)).length;

  const byZone = useMemo(() => {
    const m = new Map<string, number>();
    all.forEach((o) => m.set(o.zone || t("no_zone"), (m.get(o.zone || t("no_zone")) ?? 0) + 1));
    return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [all, t]);

  // alerts are derived from real data (no invented events)
  const alerts = useMemo(() => {
    const now = Date.now();
    const out: { key: string; tone: "red" | "amber"; text: string; sub: string }[] = [];
    all.forEach((o) => {
      if (o.status === "failed") out.push({ key: `f${o.id}`, tone: "red", text: `#${o.external_id}`, sub: t("alert_failed") });
      else if (o.status === "ready" || o.status === "new") out.push({ key: `u${o.id}`, tone: "amber", text: `#${o.external_id}`, sub: t("alert_unassigned") });
      if (OPEN.includes(o.status) && o.window_end && new Date(o.window_end).getTime() < now) out.push({ key: `l${o.id}`, tone: "amber", text: `#${o.external_id}`, sub: t("alert_late") });
    });
    (couriers.data ?? []).forEach((c) => {
      if (c.status === "busy" && (c.freshness === "offline" || c.freshness === "unknown")) out.push({ key: `g${c.id}`, tone: "red", text: c.full_name, sub: t("gps_stale") });
    });
    return out.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "red" ? -1 : 1)).slice(0, 6);
  }, [all, couriers.data, t]);

  const recent = all.slice(0, 5);
  const actions = [
    { href: "/orders/new", label: t("qa_create"), icon: <IconPlus />, show: can.createOrder(me?.role) },
    { href: "/shipments", label: t("qa_map"), icon: <IconMap />, show: fleet },
    { href: "/settings/geofencing", label: t("qa_zones"), icon: <IconSettings />, show: fleet },
    { href: "/settings/addresses", label: t("qa_address"), icon: <IconOrders />, show: can.addresses(me?.role) },
  ].filter((a) => a.show);

  return (
    <main className="space-y-4 px-5 py-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard icon={<IconBox />} label={t("kpi_total")} value={all.length} sub={t("kpi_sub")} />
        <KpiCard icon={<IconClock />} label={t("kpi_pending")} value={count(["new", "ready"])} />
        <KpiCard icon={<IconTruck />} label={t("kpi_transit")} value={count(["assigned", "picked_up"])} />
        <KpiCard icon={<IconCheck />} label={t("kpi_delivered")} value={count(["delivered"])} />
        <KpiCard icon={<IconAlert />} label={t("kpi_failed")} value={count(["failed"])} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <BarChart title={t("orders_by_zone")} data={byZone} />
          <Card className="overflow-x-auto p-5">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{t("recent_orders")}</h2><Link href="/orders" className="text-sm text-brand-text">{t("view_all")} →</Link></div>
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs text-muted"><tr><th className="py-2">{t("col_order")}</th><th>{t("col_customer")}</th><th>{t("status")}</th><th>{t("courier")}</th><th>{t("zone")}</th></tr></thead>
              <tbody>
                {recent.map((o) => (
                  <tr key={o.id} className="border-b last:border-0">
                    <td className="py-2.5">#{o.external_id}</td>
                    <td><span className="flex items-center gap-2"><Avatar name={o.customer_name || o.delivery_address} size={28} /><span className="max-w-[160px] truncate">{o.customer_name || o.delivery_address}</span></span></td>
                    <td><StatusBadge status={o.status} /></td>
                    <td className="text-muted">{o.courier_name ?? "—"}</td><td className="text-muted">{o.zone || "—"}</td>
                  </tr>))}
                {!orders.isLoading && recent.length === 0 && <tr><td colSpan={5} className="py-4 text-muted">{t("no_orders")}</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">{t("recent_alerts")}</h2>
            <ul className="space-y-3">
              {alerts.map((a) => (
                <li key={a.key} className="flex items-center gap-3 text-sm">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${a.tone === "red" ? "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300" : "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300"}`}><IconAlert className="!h-4 !w-4" /></span>
                  <span className="min-w-0"><span className="block truncate font-medium">{a.text}</span><span className="block truncate text-xs text-muted">{a.sub}</span></span>
                </li>))}
              {alerts.length === 0 && <li className="text-sm text-muted">{t("no_alerts")}</li>}
            </ul>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">{t("quick_actions")}</h2>
            <div className="grid grid-cols-2 gap-3">
              {actions.map((a) => (
                <Link key={a.href} href={a.href} className="flex flex-col items-center gap-2 rounded-xl border bg-surface2 px-2 py-4 text-center text-xs hover:border-brand">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-solo text-white">{a.icon}</span>{a.label}
                </Link>))}
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}

export default function Page() {
  const { t } = useT();
  return <AppShell><div className="px-5 pt-4"><h1 className="text-2xl font-semibold">{t("nav_analytics")}</h1></div><Dashboard /></AppShell>;
}
