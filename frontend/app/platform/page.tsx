"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AppShell from "@/components/AppShell";
import { Button, Card, ErrorText, Field, Modal, inputCls } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { PlatformTenant } from "@/lib/types";

function CreateModal({ onClose }: { onClose: () => void }) {
  const { call } = useAuth();
  const { t } = useT();
  const qc = useQueryClient();
  const [d, setD] = useState({ name: "", slug: "", brand_color: "#F26A1B", logo_text: "", owner_email: "", owner_password: "", first_branch_name: "Main branch" });
  const save = useMutation({ mutationFn: () => call("/platform/tenants", { method: "POST", body: JSON.stringify(d) }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform-tenants"] }); onClose(); } });
  return (
    <Modal title={t("create_company")} onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("name")}><input className={inputCls} required value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
          <Field label={t("slug")}><input className={inputCls} required pattern="[a-z0-9][a-z0-9\-]{2,38}" value={d.slug} onChange={(e) => setD({ ...d, slug: e.target.value.toLowerCase() })} /></Field>
          <Field label={t("brand_color")}><input className={`${inputCls} h-11 p-1`} type="color" value={d.brand_color} onChange={(e) => setD({ ...d, brand_color: e.target.value })} /></Field>
          <Field label={t("logo_letters")}><input className={inputCls} maxLength={3} value={d.logo_text} onChange={(e) => setD({ ...d, logo_text: e.target.value })} /></Field>
        </div>
        <Field label={t("owner_email")}><input className={inputCls} type="email" required value={d.owner_email} onChange={(e) => setD({ ...d, owner_email: e.target.value })} /></Field>
        <Field label={t("temp_password")} hint={t("must_change_body")}><input className={inputCls} type="password" minLength={8} autoComplete="new-password" value={d.owner_password} onChange={(e) => setD({ ...d, owner_password: e.target.value })} /></Field>
        <Field label={t("first_branch")}><input className={inputCls} value={d.first_branch_name} onChange={(e) => setD({ ...d, first_branch_name: e.target.value })} /></Field>
        <ErrorText error={save.error} />
        <Button className="w-full" disabled={save.isPending}>{t("create_company")}</Button>
      </form>
    </Modal>
  );
}

function SupportModal({ tenant, onClose }: { tenant: PlatformTenant; onClose: () => void }) {
  const { call, adoptToken } = useAuth();
  const { t } = useT();
  const router = useRouter();
  const [reason, setReason] = useState(""); const [minutes, setMinutes] = useState(30);
  const go = useMutation({
    mutationFn: () => call<{ access_token: string }>(`/platform/tenants/${tenant.id}/support-access`, { method: "POST", body: JSON.stringify({ reason, minutes }) }),
    onSuccess: async (r) => { await adoptToken(r.access_token); router.push("/"); },
  });
  return (
    <Modal title={`${t("support_access")} — ${tenant.name}`} onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); go.mutate(); }}>
        <Field label={t("support_reason")}><textarea className={inputCls} rows={3} minLength={10} required value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <Field label={t("support_minutes")}><input className={inputCls} type="number" min={5} max={240} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></Field>
        <ErrorText error={go.error} />
        <Button className="w-full" disabled={go.isPending || reason.trim().length < 10}>{t("open_company")}</Button>
      </form>
    </Modal>
  );
}

function Platform() {
  const { call, me } = useAuth();
  const { t } = useT();
  const [create, setCreate] = useState(false); const [support, setSupport] = useState<PlatformTenant | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["platform-tenants"], enabled: !!me?.is_platform_admin, queryFn: () => call<PlatformTenant[]>("/platform/tenants") });
  if (!me?.is_platform_admin) return <main className="p-8 text-sm text-muted">{t("only_admin")}</main>;
  return (
    <main className="space-y-4 px-6 pb-8 pt-4 lg:px-9">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">{t("platform_title")}</h1><Button onClick={() => setCreate(true)}>+ {t("create_company")}</Button></div>
      <ErrorText error={error} />
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs text-muted"><tr><th className="p-3">{t("name")}</th><th>{t("slug")}</th><th>{t("plan")}</th><th>{t("team_title")}</th><th>{t("nav_orders")}</th><th /></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="p-4 text-muted">{t("loading")}</td></tr>}
            {(data ?? []).map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="p-3"><span className="flex items-center gap-2"><span className="flex h-8 min-w-8 items-center justify-center rounded-lg px-1 text-xs font-bold text-white" style={{ background: c.brand_color }}>{c.logo_text || c.name[0]}</span><b>{c.name}</b>{c.is_simulated && <span className="rounded bg-surface2 px-1.5 text-[10px]">demo</span>}</span></td>
                <td className="text-muted">{c.slug}</td><td>{c.plan}</td><td>{t("members_n", { n: c.members })}</td><td>{t("orders_n", { n: c.orders })}</td>
                <td className="pr-3 text-right"><Button variant="secondary" className="!px-3 !py-1.5 text-xs" onClick={() => setSupport(c)}>{t("support_access")}</Button></td>
              </tr>))}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-muted">{t("role_note")}</p>
      {create && <CreateModal onClose={() => setCreate(false)} />}
      {support && <SupportModal tenant={support} onClose={() => setSupport(null)} />}
    </main>
  );
}

export default function Page() { return <AppShell><Platform /></AppShell>; }
