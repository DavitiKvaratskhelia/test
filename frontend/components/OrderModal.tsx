"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { can, useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { ageText, Courier, FRESH_COLOR, Order, OrderEvent } from "@/lib/types";
import { IconCheck, IconCircle, IconCopy, IconExternal, IconMail, IconPin, IconPlus, IconUser, IconX } from "./icons";
import { Avatar } from "./kit";
import { Button, ErrorText, Menu, StatusBadge, inputCls } from "./ui";

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) : "");

function CourierPicker({ order, onDone }: { order: Order; onDone: (courierId: number | null) => void }) {
  const { call } = useAuth();
  const { t } = useT();
  const { data } = useQuery({ queryKey: ["couriers"], queryFn: () => call<Courier[]>("/fleet/couriers") });
  return (
    <div className="rounded-2xl border bg-surface p-2">
      <ul className="max-h-56 divide-y overflow-y-auto">
        {(data ?? []).map((c) => {
          const heavy = c.capacity_kg != null && c.capacity_kg > 0 && order.weight_kg > c.capacity_kg;
          return (
            <li key={c.id}>
              <button disabled={heavy} onClick={() => onDone(c.id)} className="flex w-full items-center gap-3 px-2 py-2 text-left text-sm hover:bg-surface2 disabled:cursor-not-allowed disabled:opacity-50">
                <Avatar name={c.full_name} size={32} />
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{c.full_name}</span>
                  <span className="block truncate text-xs text-muted">{c.transport ? t(`tr_${c.transport}` as Parameters<typeof t>[0]) : "—"}{c.capacity_kg ? ` · ${c.capacity_kg} kg` : ""}{heavy ? ` · ${t("too_heavy_short")}` : ""}</span></span>
                <span className="flex items-center gap-1 text-xs text-muted"><i className="h-2 w-2 rounded-full" style={{ background: FRESH_COLOR[c.freshness] }} />{c.freshness === "unknown" ? t("no_courier_gps") : ageText(c.age_seconds)}</span>
              </button>
            </li>);
        })}
      </ul>
    </div>
  );
}

export default function OrderModal({ orderId, onClose }: { orderId: number; onClose: () => void }) {
  const { call, me } = useAuth();
  const { t } = useT();
  const qc = useQueryClient();
  const [picker, setPicker] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState(""); const [reason, setReason] = useState("");
  const [comment, setComment] = useState(""); const [copied, setCopied] = useState(false);
  const canWrite = can.createOrder(me?.role);   // status / comment (server: orders:write)
  const canDispatch = can.dispatch(me?.role);   // courier assignment (server: dispatch)

  const { data: o, error, isLoading } = useQuery({ queryKey: ["order", orderId], queryFn: () => call<Order>(`/orders/${orderId}`) });
  useEffect(() => { if (o) setComment(o.comment ?? ""); }, [o?.id, o?.version]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["order", orderId] }); qc.invalidateQueries({ queryKey: ["orders"] }); };
  const assign = useMutation({ mutationFn: (cid: number | null) => call(`/orders/${orderId}/assign`, { method: "POST", body: JSON.stringify({ courier_id: cid, expected_version: o?.version }) }), onSuccess: () => { setPicker(false); refresh(); } });
  const status = useMutation({ mutationFn: () => call(`/orders/${orderId}/status`, { method: "POST", body: JSON.stringify({ status: nextStatus, reason, expected_version: o?.version }) }), onSuccess: () => { setStatusOpen(false); setNextStatus(""); setReason(""); refresh(); } });
  const saveComment = useMutation({ mutationFn: () => call(`/orders/${orderId}`, { method: "PATCH", body: JSON.stringify({ comment, expected_version: o?.version }) }), onSuccess: refresh });
  const link = useMutation({ mutationFn: () => call<{ token: string }>(`/orders/${orderId}/links`, { method: "POST" }) });

  const trackingUrl = async () => `${window.location.origin}/track/${(await link.mutateAsync()).token}`;
  const copyLink = async () => { try { await navigator.clipboard.writeText(await trackingUrl()); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} };
  const openTracking = async () => { const url = await trackingUrl(); window.open(url, "_blank", "noopener"); };

  const first = (to: string[]) => o?.events?.find((e: OrderEvent) => to.includes(e.to));
  const failed = o?.events?.slice().reverse().find((e) => e.to === "failed");
  const steps: { key: string; label: string; at?: string | null; done: boolean; bad?: boolean; sub?: string }[] = o ? [
    { key: "p", label: t("tl_placed"), at: first(["new", "ready"])?.at ?? o.created_at, done: true },
    { key: "a", label: t("tl_assigned"), at: first(["assigned"])?.at, done: !!first(["assigned"]) },
    { key: "k", label: t("tl_picked"), at: first(["picked_up"])?.at, done: !!first(["picked_up"]) },
    { key: "w", label: t("tl_way"), at: first(["on_the_way"])?.at, done: !!first(["on_the_way"]) },
    failed && o.status === "failed" ? { key: "f", label: t("tl_failed"), at: failed.at, done: true, bad: true, sub: failed.reason }
      : { key: "d", label: t("tl_delivered"), at: first(["delivered"])?.at, done: !!first(["delivered"]) },
  ] : [];

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-3" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label={t("order_details")} className="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-pop shadow-xl">
        {isLoading || !o ? <div className="p-8 text-sm text-muted">{error ? String(error) : t("loading")}</div> : (
          <>
            <div className="flex items-start justify-between border-b px-7 py-5">
              <div>
                <h2 className="text-lg font-bold">{t("order_details_id")} <span className="text-brand-text">#{o.external_id}</span></h2>
                <p className="text-sm text-muted">{t("order_created_at")}: {fmt(o.created_at)} <span className="ml-2"><StatusBadge status={o.status} /></span></p>
              </div>
              <div className="flex items-center gap-2">
                <Menu items={[{ label: t("copy_link"), onClick: copyLink }, ...(canWrite && o.allowed_next?.includes("cancelled") ? [{ label: t("cancel_order"), danger: true, onClick: () => { setStatusOpen(true); setNextStatus("cancelled"); } }] : [])]} />
                <button aria-label={t("close")} onClick={onClose} className="rounded-full border p-2 hover:bg-surface2"><IconX className="!h-4 !w-4" /></button>
              </div>
            </div>
            <div className="overflow-y-auto px-7 py-5">
              <div className="mb-5 flex flex-wrap gap-2">
                {o.customer_phone?.trim() && <a href={`sms:${o.customer_phone.replace(/[^0-9+]/g, "")}`} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs hover:bg-surface2"><IconMail className="!h-4 !w-4" />{t("message_customer")}</a>}
                <button onClick={copyLink} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs hover:bg-surface2"><IconCopy className="!h-4 !w-4" />{copied ? t("link_copied") : t("copy_link")}</button>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-5">
                  <section>
                    <h3 className="mb-2 font-semibold">{t("courier")}</h3>
                    {o.courier_name ? (
                      <div className="flex items-center gap-3 rounded-2xl border bg-surface p-3">
                        <Avatar name={o.courier_name} size={40} />
                        <div className="min-w-0 flex-1 text-sm"><div className="truncate font-medium">{o.courier_name}</div><div className="truncate text-xs text-muted">{o.courier_phone || "—"}{o.courier_transport ? ` · ${o.courier_transport}` : ""}</div></div>
                        {canDispatch && ["new", "ready", "assigned"].includes(o.status) && <Button variant="secondary" className="!px-3 !py-1.5 text-xs" onClick={() => setPicker(!picker)}>{t("change_courier")}</Button>}
                      </div>
                    ) : canDispatch && ["new", "ready"].includes(o.status) ? (
                      <button onClick={() => setPicker(!picker)} className="flex h-24 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand/60 bg-brand-light text-sm font-medium text-brand-text"><IconPlus className="!h-4 !w-4" />{t("assign")}</button>
                    ) : <p className="text-sm text-muted">{t("unassigned_courier")}</p>}
                    {picker && <div className="mt-2"><CourierPicker order={o} onDone={(id) => assign.mutate(id)} />{o.courier_name && <button className="mt-1 text-xs text-red-600 underline" onClick={() => assign.mutate(null)}>{t("unassigned_courier")}</button>}</div>}
                    <ErrorText error={assign.error} />
                  </section>
                  <section>
                    <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">{t("route")}</h3>
                      <span className="text-xs text-muted" title={t("straight_line")}>{t("distance")}: <b className="text-ink">{o.distance_m != null ? `≈ ${(o.distance_m / 1000).toFixed(2)} km` : "—"}</b>{o.price != null ? ` · ${o.price} ${o.currency}` : ""}</span></div>
                    <div className="space-y-4 rounded-2xl border bg-surface p-4 text-sm">
                      <div className="flex gap-3"><IconCircle className="mt-0.5 shrink-0 text-muted" /><div className="min-w-0"><div className="text-xs text-muted">{o.pickup_branch || "—"}</div><div className="font-semibold">{o.pickup_address || "—"}</div></div></div>
                      <div className="flex gap-3"><IconPin className="mt-0.5 shrink-0" /><div className="min-w-0"><div className="text-xs text-muted">{o.customer_name || "—"}{o.customer_phone ? ` - ${o.customer_phone}` : ""}</div><div className="font-semibold">{o.delivery_address}</div></div></div>
                    </div>
                  </section>
                </div>
                <section>
                  <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">{t("order_status")}</h3>
                    <button onClick={openTracking} className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100 dark:bg-sky-500/15 dark:text-sky-300">{t("tracking_link")}<IconExternal className="!h-3.5 !w-3.5" /></button></div>
                  <ol className="space-y-4 rounded-2xl border bg-surface p-4">
                    {steps.map((s) => (
                      <li key={s.key} className={`flex items-start gap-3 text-sm ${s.done ? "" : "text-muted"}`}>
                        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${s.bad ? "border-red-500 bg-red-500 text-white" : s.done ? "border-ink bg-ink text-app" : "border-line"}`}>{s.done ? <IconCheck className="!h-3.5 !w-3.5" /> : null}</span>
                        <span><span className="block font-semibold">{s.label}</span>{s.at && <span className="block text-xs text-muted">{fmt(s.at)}</span>}{s.sub && <span className="block text-xs text-red-600">{s.sub}</span>}</span>
                      </li>))}
                  </ol>
                </section>
              </div>
              <section className="mt-5">
                <h3 className="mb-2 font-semibold">{t("additional_comment")}</h3>
                <div className="relative"><IconUser className="pointer-events-none absolute left-3 top-1/2 !h-4 !w-4 -translate-y-1/2 text-muted" />
                  <input className={`${inputCls} pl-9`} disabled={!canWrite} value={comment} onChange={(e) => setComment(e.target.value)} onBlur={() => comment !== (o.comment ?? "") && saveComment.mutate()} aria-label={t("additional_comment")} /></div>
                <ErrorText error={saveComment.error} />
              </section>
              {canWrite && (o.allowed_next?.length ?? 0) > 0 && (
                <section className="mt-5">
                  {statusOpen && (
                    <div className="mb-3 grid gap-2 rounded-2xl border bg-surface p-3 sm:grid-cols-[1fr_1.5fr_auto]">
                      <select className={inputCls} aria-label={t("sel_status")} value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
                        <option value="">{t("sel_status")}</option>{o.allowed_next!.map((s) => <option key={s} value={s}>{t(`st_${s}` as Parameters<typeof t>[0])}</option>)}</select>
                      <input className={inputCls} placeholder={t("reason")} aria-label={t("reason")} value={reason} onChange={(e) => setReason(e.target.value)} />
                      <Button disabled={!nextStatus || (nextStatus === "failed" && !reason.trim()) || status.isPending} onClick={() => status.mutate()}>{t("save")}</Button>
                    </div>)}
                  <ErrorText error={status.error} />
                  <Button className="h-12 w-full tracking-wide" onClick={() => setStatusOpen(!statusOpen)}>{t("change_status")}</Button>
                </section>)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
