"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { IconCopy, IconPin } from "./icons";
import { Button, ErrorText, Modal } from "./ui";

type Pin = { id: number; token: string; path: string; state: "pending" | "done" | "expired" | "revoked"; lat: number | null; lon: number | null; created_at: string; expires_at: string };

/** "Get The Pin": the operator creates a 24h link; the customer opens it on their phone and drops a pin; the result appears here. */
export default function PinModal({ onClose }: { onClose: () => void }) {
  const { call } = useAuth();
  const { t } = useT();
  const qc = useQueryClient();
  const [copied, setCopied] = useState<number | null>(null);
  const pins = useQuery({ queryKey: ["pins"], queryFn: () => call<Pin[]>("/pins?limit=10"), refetchInterval: 8000 });
  const create = useMutation({ mutationFn: () => call<Pin>("/pins", { method: "POST" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["pins"] }) });
  const copy = (p: Pin) => { navigator.clipboard?.writeText(`${window.location.origin}${p.path}`).then(() => { setCopied(p.id); setTimeout(() => setCopied(null), 1500); }).catch(() => {}); };
  const stateLabel = { pending: t("pin_pending"), done: t("pin_done"), expired: t("pin_expired"), revoked: t("pin_revoked") };
  return (
    <Modal title={t("pin_title")} onClose={onClose}>
      <p className="mb-4 text-sm text-muted">{t("pin_intro")}</p>
      <Button className="mb-4 w-full" onClick={() => create.mutate()} disabled={create.isPending}><IconPin className="!h-4 !w-4" />{t("pin_create")}</Button>
      <ErrorText error={create.error} />
      <ul className="max-h-80 space-y-2 overflow-y-auto">
        {(pins.data ?? []).map((p) => (
          <li key={p.id} className="rounded-xl border bg-surface p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className={`rounded-lg border px-2 py-0.5 text-xs ${p.state === "done" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : p.state === "pending" ? "border-amber-300 bg-amber-50 text-amber-700" : "text-muted"}`}>{stateLabel[p.state]}</span>
              <span className="text-xs text-muted">{t("pin_expires")}: {new Date(p.expires_at).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            {p.state === "done" && <div className="mt-2 text-xs">{p.lat?.toFixed(5)}, {p.lon?.toFixed(5)}</div>}
            <div className="mt-2 flex gap-2">
              {(p.state === "pending" || p.state === "done") && <Button variant="secondary" className="!px-3 !py-1.5 text-xs" onClick={() => copy(p)}><IconCopy className="!h-3.5 !w-3.5" />{copied === p.id ? t("link_copied") : t("pin_copy")}</Button>}
              {p.state === "done" && <Link href={`/orders/new?pin=${p.id}`} onClick={onClose} className="inline-flex items-center rounded-xl bg-solo px-3 py-1.5 text-xs font-medium text-white hover:bg-solo-hover">{t("pin_use")}</Link>}
            </div>
          </li>))}
        {pins.data?.length === 0 && <li className="text-sm text-muted">{t("no_orders")}</li>}
      </ul>
    </Modal>
  );
}
