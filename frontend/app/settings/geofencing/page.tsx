"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button, Card, ErrorText, Field, Menu, Modal, inputCls } from "@/components/ui";
import { can, useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { Courier, Zone } from "@/lib/types";

const ZoneEditor = dynamic(() => import("@/components/ZoneEditor"), { ssr: false, loading: () => <div className="h-[55vh] animate-pulse rounded-xl bg-line" /> });
const COLORS = ["#F26A1B", "#2563EB", "#16A34A", "#9333EA", "#DB2777", "#0891B2"];

/** Lightweight SVG preview of a polygon (no tile requests, so cards stay cheap). */
function Preview({ polygon, color }: { polygon: number[][]; color: string }) {
  const xs = polygon.map((p) => p[0]), ys = polygon.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX || 1, h = maxY - minY || 1, s = 160 / Math.max(w, h);
  const pts = polygon.map(([x, y]) => `${10 + (x - minX) * s},${10 + (maxY - y) * s}`).join(" ");
  return (
    <svg viewBox={`0 0 ${20 + w * s} ${20 + h * s}`} className="h-28 w-full bg-surface2" role="img" aria-label="zone shape">
      <polygon points={pts} fill={color} fillOpacity="0.25" stroke={color} strokeWidth="2" />
    </svg>
  );
}

function EditorModal({ zone, zones, onClose }: { zone?: Zone; zones: Zone[]; onClose: () => void }) {
  const { call } = useAuth();
  const { t } = useT();
  const qc = useQueryClient();
  const [name, setName] = useState(zone?.name ?? "");
  const [color, setColor] = useState(zone?.color ?? COLORS[zones.length % COLORS.length]);
  const [points, setPoints] = useState<number[][]>(zone?.polygon ?? []);
  const [hidden, setHidden] = useState<number[]>([]);
  const [priority, setPriority] = useState(zone?.priority ?? 0);
  const save = useMutation({
    mutationFn: () => call(zone ? `/zones/${zone.id}` : "/zones", { method: zone ? "PUT" : "POST", body: JSON.stringify({ name, color, polygon: points, active: true, priority }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["zones"] }); onClose(); },
  });
  const others = zones.filter((z) => z.id !== zone?.id && !hidden.includes(z.id));
  return (
    <Modal title={zone ? t("edit") : t("create_zone")} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64"><Field label={t("zone_name")}><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field></div>
          <div className="w-32"><Field label={t("zone_priority")}><input className={inputCls} type="number" min={0} max={100} value={priority} onChange={(e) => setPriority(Number(e.target.value))} /></Field></div>
          <Field label={t("color")}>
            <span className="flex gap-1.5">{COLORS.map((c) => <button type="button" key={c} aria-label={c} onClick={() => setColor(c)} className={`h-8 w-8 rounded-full border-2 ${color === c ? "border-ink" : "border-white shadow"}`} style={{ background: c }} />)}</span>
          </Field>
          <Button variant="secondary" disabled={points.length === 0} onClick={() => setPoints(points.slice(0, -1))}>{t("undo")}</Button>
          <Button variant="secondary" disabled={points.length === 0} onClick={() => setPoints([])}>{t("clear")}</Button>
          <span className="text-sm text-muted" data-testid="point-count">{points.length}</span>
        </div>
        <p className="text-xs text-muted">{t("zone_hint")}</p>
        <div className="relative">
          <ZoneEditor points={points} color={color} others={others} onAdd={(p) => setPoints((s) => [...s, p])} />
          {zones.filter((z) => z.id !== zone?.id).length > 0 && (
            <div className="absolute bottom-3 right-3 z-[1000] space-y-1 rounded-lg border bg-surface/95 p-2 text-xs shadow">
              {zones.filter((z) => z.id !== zone?.id).map((z) => (
                <label key={z.id} className="flex items-center gap-2"><input type="checkbox" checked={!hidden.includes(z.id)} onChange={() => setHidden((h) => h.includes(z.id) ? h.filter((x) => x !== z.id) : [...h, z.id])} />{z.name}</label>
              ))}
            </div>
          )}
        </div>
        <ErrorText error={save.error} />
        <Button disabled={save.isPending || points.length < 3 || !name.trim()} onClick={() => save.mutate()}>{t("save")}</Button>
      </div>
    </Modal>
  );
}

function CouriersModal({ zone, onClose }: { zone: Zone; onClose: () => void }) {
  const { call } = useAuth();
  const { t } = useT();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["couriers"], queryFn: () => call<Courier[]>("/fleet/couriers") });
  const [sel, setSel] = useState<number[]>(zone.courier_ids);
  const save = useMutation({
    mutationFn: () => call(`/zones/${zone.id}/couriers`, { method: "PUT", body: JSON.stringify({ courier_ids: sel }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["zones"] }); onClose(); },
  });
  return (
    <Modal title={`${zone.name} — ${t("assign_couriers")}`} onClose={onClose}>
      <div className="space-y-3">
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {(data ?? []).map((c) => (
            <li key={c.id}><label className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-surface2">
              <input type="checkbox" checked={sel.includes(c.id)} onChange={() => setSel((s) => s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id])} />{c.full_name}
              <span className="text-xs text-muted">{c.zone}</span></label></li>
          ))}
        </ul>
        <ErrorText error={save.error} />
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{t("save")}</Button>
      </div>
    </Modal>
  );
}

export default function Page() {
  const { call, me } = useAuth();
  const { t } = useT();
  const qc = useQueryClient();
  const writable = can.manageZones(me?.role);
  const [q, setQ] = useState("");
  const [editor, setEditor] = useState<{ zone?: Zone } | null>(null);
  const [assign, setAssign] = useState<Zone | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["zones"], queryFn: () => call<Zone[]>("/zones") });
  const del = useMutation({ mutationFn: (id: number) => call(`/zones/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["zones"] }) });
  const zones = data ?? [];
  const shown = zones.filter((z) => !q || z.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("zones_title")}</h1>
        {writable && <Button variant="dark" onClick={() => setEditor({})}>+ {t("create_zone")}</Button>}
      </div>
      <input className={`${inputCls} max-w-xs`} placeholder={t("search")} aria-label={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
      {isLoading && <p className="text-sm text-muted">{t("loading")}</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((z) => (
          <Card key={z.id} className="overflow-hidden">
            <Preview polygon={z.polygon} color={z.color} />
            <div className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <h3 className="truncate font-medium"><i className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: z.color }} />{z.name}</h3>
                <button disabled={!writable} onClick={() => setAssign(z)} className="mt-1 text-sm text-muted underline decoration-dotted disabled:no-underline">{t("n_couriers", { n: z.courier_ids.length })}</button>
              </div>
              {writable && <Menu items={[
                { label: t("edit"), onClick: () => setEditor({ zone: z }) },
                { label: t("assign_couriers"), onClick: () => setAssign(z) },
                { label: t("delete"), danger: true, onClick: () => { if (confirm(t("confirm_delete"))) del.mutate(z.id); } },
              ]} />}
            </div>
          </Card>
        ))}
      </div>
      {!isLoading && zones.length === 0 && <p className="text-sm text-muted">{t("no_zones")}</p>}
      {editor && <EditorModal key={editor.zone?.id ?? "new"} zone={editor.zone} zones={zones} onClose={() => setEditor(null)} />}
      {assign && <CouriersModal key={assign.id} zone={assign} onClose={() => setAssign(null)} />}
    </div>
  );
}
