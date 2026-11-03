"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Button, Card, ErrorText, Field, Menu, Modal, inputCls } from "@/components/ui";
import { can, useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { SavedAddress } from "@/lib/types";

const AddressPicker = dynamic(() => import("@/components/AddressPicker"), { ssr: false, loading: () => <div className="h-56 animate-pulse rounded-xl bg-neutral-200" /> });
const PAGE = 12;
type Draft = { name: string; address: string; details: string; phone: string; lat: number | null; lon: number | null };
const EMPTY: Draft = { name: "", address: "", details: "", phone: "+995 ", lat: null, lon: null };

function AddressModal({ initial, id, onClose }: { initial: Draft; id?: number; onClose: () => void }) {
  const { call } = useAuth();
  const { t } = useT();
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(initial);
  const save = useMutation({
    mutationFn: () => call(id ? `/addresses/${id}` : "/addresses", { method: id ? "PUT" : "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["addresses"] }); onClose(); },
  });
  return (
    <Modal title={id ? t("edit") : t("add_address")} onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label={t("address")}><input className={inputCls} required value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} /></Field>
        <AddressPicker value={d.lat != null && d.lon != null ? { lat: d.lat, lon: d.lon } : null} onPick={(lat, lon) => setD({ ...d, lat, lon })} />
        <p className="text-xs text-neutral-400">{t("pin_hint")}</p>
        <Field label={t("entrance")}><textarea className={inputCls} rows={2} value={d.details} onChange={(e) => setD({ ...d, details: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("name")}><input className={inputCls} required value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
          <Field label={t("phone")}><input className={inputCls} inputMode="tel" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} /></Field>
        </div>
        <ErrorText error={save.error} />
        <Button className="w-full" disabled={save.isPending}>{id ? t("save") : t("add")}</Button>
      </form>
    </Modal>
  );
}

export default function Page() {
  const { call, me } = useAuth();
  const { t } = useT();
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [q, setQ] = useState(""); const [dq, setDq] = useState("");
  const [modal, setModal] = useState<{ id?: number; draft: Draft } | null>(null);
  useEffect(() => { const h = setTimeout(() => { setDq(q); setPage(0); }, 250); return () => clearTimeout(h); }, [q]);
  const { data, isLoading } = useQuery({
    queryKey: ["addresses", dq, page],
    queryFn: () => call<{ total: number; items: SavedAddress[] }>(`/addresses?limit=${PAGE}&offset=${page * PAGE}${dq ? `&q=${encodeURIComponent(dq)}` : ""}`),
  });
  const del = useMutation({ mutationFn: (id: number) => call(`/addresses/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["addresses"] }) });
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  const writable = can.addresses(me?.role);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("addr_title")} <span className="text-sm font-normal text-neutral-400">({data?.total ?? 0})</span></h1>
        <div className="flex gap-2">
          <input className={`${inputCls} w-56`} placeholder={t("search")} aria-label={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
          {writable && <Button onClick={() => setModal({ draft: EMPTY })}>+ {t("add_address")}</Button>}
        </div>
      </div>
      {isLoading && <p className="text-sm text-neutral-500">{t("loading")}</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data?.items.map((a) => (
          <Card key={a.id} className="overflow-hidden" >
            <div className="flex items-center justify-between bg-neutral-50 px-4 py-2">
              <h3 className="truncate font-medium">{a.name}</h3>
              {writable && <Menu items={[
                { label: t("edit"), onClick: () => setModal({ id: a.id, draft: { name: a.name, address: a.address, details: a.details, phone: a.phone, lat: a.lat, lon: a.lon } }) },
                { label: t("delete"), danger: true, onClick: () => { if (confirm(t("confirm_delete"))) del.mutate(a.id); } },
              ]} />}
            </div>
            <dl className="space-y-2 p-4 text-sm">
              <div><dt className="text-xs text-neutral-400">{t("address")}</dt><dd className="truncate">{a.address}{a.details ? ` · ${a.details}` : ""}</dd></div>
              <div><dt className="text-xs text-neutral-400">{t("phone")}</dt><dd>{a.phone || "—"}</dd></div>
            </dl>
          </Card>
        ))}
      </div>
      {data && data.items.length === 0 && <p className="text-sm text-neutral-500">{t("no_orders")}</p>}
      <div className="flex items-center justify-center gap-2">
        <Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="prev">‹</Button>
        <span className="text-sm text-neutral-600">{page + 1} / {pages}</span>
        <Button variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="next">›</Button>
      </div>
      {modal && <AddressModal key={modal.id ?? "new"} id={modal.id} initial={modal.draft} onClose={() => setModal(null)} />}
    </div>
  );
}
