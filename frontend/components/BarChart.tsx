"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n";

export type Bar = { label: string; value: number };

/** Ranked horizontal bars. Single series → no legend; value printed at each bar tip (contrast relief), tooltip on hover/focus,
 *  and a table view with the same numbers. Bars ≤ 24px, 4px rounded data end, square at the baseline, hairline gridlines. */
export default function BarChart({ data, title }: { data: Bar[]; title: string }) {
  const { t } = useT();
  const [table, setTable] = useState(false);
  const [tip, setTip] = useState<number | null>(null);
  const total = data.reduce((a, d) => a + d.value, 0);
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = max <= 5 ? 1 : max <= 10 ? 2 : Math.ceil(max / 5);
  const axis = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: axis / step + 1 }, (_, i) => i * step);
  const pct = (v: number) => (v / axis) * 100;

  return (
    <section aria-label={title} className="rounded-2xl border bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <button className="rounded-full border px-3 py-1 text-xs text-muted hover:bg-surface2" onClick={() => setTable(!table)}>{table ? t("view_chart") : t("view_table")}</button>
      </div>
      {data.length === 0 ? <p className="text-sm text-muted">{t("no_orders")}</p> : table ? (
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs text-muted"><tr><th className="py-2">{t("zone")}</th><th className="text-right">{t("n_orders", { n: "" }).trim() || "#"}</th><th className="text-right">{t("share")}</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.label} className="border-b last:border-0"><td className="py-2">{d.label}</td><td className="text-right">{d.value}</td><td className="text-right text-muted">{total ? Math.round((d.value / total) * 100) : 0}%</td></tr>)}</tbody>
        </table>
      ) : (
        <div className="grid grid-cols-[7.5rem_1fr] gap-x-3 text-sm">
          <div className="flex flex-col">
            {data.map((d) => <div key={d.label} className="flex h-9 items-center truncate text-muted" title={d.label}><span className="truncate">{d.label}</span></div>)}
          </div>
          <div className="relative">
            {/* hairline, recessive gridlines */}
            {ticks.map((tk) => <div key={tk} className="absolute inset-y-0 w-px bg-line" style={{ left: `${pct(tk)}%` }} aria-hidden />)}
            <div className="relative flex flex-col">
              {data.map((d, i) => (
                <div key={d.label} tabIndex={0} role="img" aria-label={`${d.label}: ${d.value}`}
                  className="relative flex h-9 items-center outline-none focus-visible:bg-surface2"
                  onPointerEnter={() => setTip(i)} onPointerLeave={() => setTip(null)} onFocus={() => setTip(i)} onBlur={() => setTip(null)}>
                  <div className="h-5 bg-chart" style={{ width: `${pct(d.value)}%`, borderRadius: "0 4px 4px 0", minWidth: d.value ? 2 : 0 }} />
                  <span className="absolute text-xs font-medium" style={{ left: `calc(${pct(d.value)}% + 8px)` }}>{d.value}</span>
                  {tip === i && (
                    <div role="tooltip" className="pointer-events-none absolute z-10 -translate-y-full rounded-lg border bg-surface px-3 py-2 text-xs shadow-lg" style={{ left: `min(${pct(d.value)}%, 70%)`, top: 0 }}>
                      <div className="text-muted">{d.label}</div>
                      <div><strong className="text-sm">{d.value}</strong> · {total ? Math.round((d.value / total) * 100) : 0}%</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="relative mt-1 h-4 text-xs text-muted">{ticks.map((tk) => <span key={tk} className="absolute -translate-x-1/2" style={{ left: `${pct(tk)}%` }}>{tk}</span>)}</div>
          </div>
        </div>
      )}
    </section>
  );
}
