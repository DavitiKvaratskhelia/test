"use client";
import { useT } from "@/lib/i18n";
import type { Order } from "@/lib/types";
import { IconBox, IconLocate, IconPhone, IconTruck } from "./icons";
import { Avatar } from "./kit";
import { IconButton, StatusBadge } from "./ui";

/** Where the truck sits on the progress line. Derived from status only — there is no live distance data. */
const PROGRESS: Record<string, number> = { new: 0, ready: 0, assigned: 28, picked_up: 62, delivered: 100, failed: 62, returned: 100, cancelled: 0 };

export function Progress({ status }: { status: string }) {
  const p = PROGRESS[status] ?? 0;
  const done = status === "delivered" || status === "returned";
  return (
    <div className="relative my-3 h-5" aria-hidden>
      <i className="absolute left-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-ink" />
      <i className="absolute left-1.5 right-1.5 top-1/2 h-px -translate-y-1/2 bg-line" />
      <i className="absolute left-1.5 top-1/2 h-px -translate-y-1/2 bg-ink" style={{ width: `calc(${p}% - 6px)` }} />
      <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-surface px-0.5 text-ink" style={{ left: `${Math.min(Math.max(p, 6), 94)}%` }}><IconTruck className="!h-4 !w-4" /></span>
      <i className={`absolute right-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 ${done ? "border-ink bg-ink" : "border-line bg-surface"}`} />
    </div>
  );
}

export default function OrderCard({ o, selected, onClick, onLocate }: { o: Order; selected: boolean; onClick: () => void; onLocate?: () => void }) {
  const { t } = useT();
  return (
    <div onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
      className={`cursor-pointer rounded-2xl border bg-surface p-4 text-sm transition hover:border-ink/30 ${selected ? "border-sky-500 ring-1 ring-sky-500/60" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-app"><IconBox /></span>
          <span className="truncate text-base font-semibold">#{o.external_id}</span>
        </div>
        <StatusBadge status={o.status} />
      </div>
      <Progress status={o.status} />
      <div className="flex justify-between gap-4 text-xs text-muted">
        <span className="line-clamp-2 max-w-[45%]">{o.pickup_address || "—"}</span>
        <span className="line-clamp-2 max-w-[45%] text-right">{o.delivery_address}</span>
      </div>
      <hr className="my-3" />
      <div className="flex items-center gap-3">
        <Avatar name={o.customer_name || o.delivery_address} size={36} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate font-medium">{o.customer_name || "—"}</div>
          <div className="truncate text-xs text-muted">{o.courier_name ?? t("unassigned_courier")}{o.zone ? ` · ${o.zone}` : ""}</div>
        </div>
        {onLocate && <IconButton label={t("pin_dropped")} onClick={(e) => { e.stopPropagation(); onLocate(); }} disabled={o.delivery_lat == null}><IconLocate className="!h-4 !w-4" /></IconButton>}
        {o.customer_phone?.trim() ? <a aria-label={t("phone")} href={`tel:${o.customer_phone.replace(/[^0-9+]/g, "")}`} onClick={(e) => e.stopPropagation()} className="flex h-9 w-9 items-center justify-center rounded-xl border bg-app hover:bg-surface2"><IconPhone className="!h-4 !w-4" /></a> : null}
      </div>
    </div>
  );
}
