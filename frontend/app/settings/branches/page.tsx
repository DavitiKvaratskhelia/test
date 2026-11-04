"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button, Card, ErrorText, Field, Modal, inputCls } from "@/components/ui";
import { can, useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { Branch } from "@/lib/types";

const AddressPicker = dynamic(() => import("@/components/AddressPicker"), { ssr: false, loading: () => <div className="h-56 animate-pulse rounded-xl bg-surface2" /> });
type Draft = { name: string; city: string; address: string; lat: number | null; lon: number | null; active: boolean };

function BranchModal({ branch, onClose }: { branch?: Branch; onClose: () => void }) {
  const { call } = useAuth();
  const { t } = useT();
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>({ name: branch?.name ?? "", city: branch?.city ?? "Tbilisi", address: branch?.address ?? "", lat: branch?.lat ?? null, lon: branch?.lon ?? null, active: branch?.active ?? true });
  const save = useMutation({
    mutationFn: () => call(branch ? `/branches/${branch.id}` : "/branches", { method: branch ? "PUT" : "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["branches"] }); onClose(); },
  });
  return (
    <Modal title={branch ? t("edit_branch") : t("add_branch")} onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("name")}><input className={inputCls} required value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
          <Field label={t("city")}><input className={inputCls} value={d.city} onChange={(e) => setD({ ...d, city: e.target.value })} /></Field>
        </div>
        <Field label={t("address")}><input className={inputCls} value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} /></Field>
        <AddressPicker value={d.lat != null && d.lon != null ? { lat: d.lat, lon: d.lon } : null} onPick={(lat, lon) => setD({ ...d, lat, lon })} />
        <p className="text-xs text-muted">{t("pin_hint")}</p>
        <ErrorText error={save.error} />
        <Button className="w-full" disabled={save.isPending}>{t("save")}</Button>
      </form>
    </Modal>
  );
}

export default function Page() {
  const { call, me } = useAuth();
  const { t } = useT();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<{ branch?: Branch } | null>(null);
  const manage = can.manageBranches(me?.role);
  const { data, isLoading } = useQuery({ queryKey: ["branches", "all"], queryFn: () => call<Branch[]>("/branches?include_inactive=true") });
  const toggle = useMutation({
    mutationFn: (b: Branch) => call(`/branches/${b.id}`, { method: "PUT", body: JSON.stringify({ ...b, active: !b.active }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["branches"] }),
  });
  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">{t("set_branches")}</h1>{manage && <Button onClick={() => setEdit({})}>+ {t("add_branch")}</Button>}</div>
      <ErrorText error={toggle.error} />
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs text-muted"><tr><th className="p-3">{t("name")}</th><th>{t("city")}</th><th>{t("address")}</th><th>{t("status")}</th><th /></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="p-4 text-muted">{t("loading")}</td></tr>}
            {(data ?? []).map((b) => (
              <tr key={b.id} className="border-b last:border-0">
                <td className="p-3 font-medium">{b.name}</td><td>{b.city}</td><td className="max-w-[260px] truncate text-muted">{b.address || "—"}</td>
                <td><span className={b.active ? "text-emerald-600" : "text-muted"}>{b.active ? t("active") : t("inactive")}</span></td>
                <td className="space-x-2 pr-3 text-right">{manage && <><Button variant="ghost" onClick={() => setEdit({ branch: b })}>{t("edit_btn")}</Button><Button variant="ghost" onClick={() => toggle.mutate(b)}>{b.active ? t("archive") : t("active")}</Button></>}</td>
              </tr>))}
          </tbody>
        </table>
      </Card>
      {edit && <BranchModal key={edit.branch?.id ?? "new"} branch={edit.branch} onClose={() => setEdit(null)} />}
    </div>
  );
}
