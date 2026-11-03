"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import AppShell from "@/components/AppShell";
import { Card, StatusBadge, inputCls } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { Order } from "@/lib/types";

const DONE = ["delivered", "failed", "returned", "cancelled"];

function History() {
  const { call } = useAuth();
  const { t } = useT();
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["orders"], queryFn: () => call<Order[]>("/orders?limit=500") });
  const rows = (data ?? []).filter((o) => DONE.includes(o.status) && (!q || [o.external_id, o.delivery_address, o.customer_name].some((v) => v?.toLowerCase().includes(q.toLowerCase()))));
  return (
    <main className="mx-auto w-full max-w-5xl space-y-3 p-4">
      <h1 className="text-xl font-semibold">{t("nav_history")}</h1>
      <input className={`${inputCls} max-w-sm`} placeholder={t("search_order")} value={q} onChange={(e) => setQ(e.target.value)} />
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs text-neutral-500"><tr><th className="p-3">#</th><th>{t("address")}</th><th>{t("zone")}</th><th>{t("status")}</th></tr></thead>
          <tbody>
            {isLoading && <tr><td className="p-3 text-neutral-500" colSpan={4}>{t("loading")}</td></tr>}
            {rows.map((o) => <tr key={o.id} className="border-b last:border-0"><td className="p-3">{o.external_id}</td><td>{o.customer_name ? `${o.customer_name} · ` : ""}{o.delivery_address}</td><td>{o.zone || "—"}</td><td><StatusBadge status={o.status} /></td></tr>)}
            {!isLoading && rows.length === 0 && <tr><td className="p-3 text-neutral-500" colSpan={4}>{t("no_orders")}</td></tr>}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
export default function Page() { return <AppShell><History /></AppShell>; }
