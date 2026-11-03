"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import AppShell from "@/components/AppShell";
import { Card, inputCls } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { ageText, Courier, FRESH_COLOR, MODEL_LABEL } from "@/lib/types";

function Couriers() {
  const { call } = useAuth();
  const { t } = useT();
  const [vt, setVt] = useState(""); const [fr, setFr] = useState("");
  const { data, isLoading, error } = useQuery({ queryKey: ["couriers"], queryFn: () => call<Courier[]>("/fleet/couriers"), refetchInterval: 15000 });
  const rows = (data ?? []).filter((c) => (!vt || c.vehicle_type === vt) && (!fr || c.freshness === fr));
  return (
    <main className="space-y-3 p-4">
            <div className="flex gap-2">
        <select className={`${inputCls} max-w-[200px]`} value={vt} onChange={(e) => setVt(e.target.value)} aria-label={t("vehicle")}>
          <option value="">{t("vehicle")}: {t("all")}</option><option value="car">{t("cars")}</option><option value="scooter">{t("scooters")}</option></select>
        <select className={`${inputCls} max-w-[240px]`} value={fr} onChange={(e) => setFr(e.target.value)} aria-label="GPS">
          <option value="">GPS: {t("all")}</option>{(["realtime", "delayed", "offline", "unknown"] as const).map((f) => <option key={f} value={f}>{t(f)}</option>)}</select>
      </div>
      {error && <p className="text-sm text-red-600">{String(error)}</p>}
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs text-muted"><tr><th className="p-3">{t("courier")}</th><th>{t("vehicle")}</th><th>{t("zone")}</th><th>{t("status")}</th><th>GPS</th><th>{t("age")}</th></tr></thead>
          <tbody>
            {isLoading && <tr><td className="p-3 text-muted" colSpan={6}>{t("loading")}</td></tr>}
            {rows.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="p-3">{c.full_name}{c.is_simulated && <span className="ml-2 rounded bg-brand-light px-1.5 text-[10px] text-brand-text">sim</span>}</td>
                <td>{MODEL_LABEL[c.vehicle_model ?? ""]?.name ?? "—"} <span className="text-xs text-muted">{c.plate}</span></td>
                <td>{c.zone || "—"}</td><td>{c.status}</td>
                <td><span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full" style={{ background: FRESH_COLOR[c.freshness] }} />{t(c.freshness)}</span></td>
                <td>{c.freshness === "unknown" ? t("never") : ageText(c.age_seconds)}</td>
              </tr>))}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
export default function Page() {
  const { t } = useT();
  return <AppShell title={t("nav_couriers")}><Couriers /></AppShell>;
}
