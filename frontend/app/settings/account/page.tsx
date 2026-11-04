"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, ErrorText, Field, Modal, inputCls } from "@/components/ui";
import { can, useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { AppSettings } from "@/lib/types";

type Tab = "profile" | "billing" | "transactions" | "methods";

function Row({ label, value, onEdit }: { label: string; value: string; onEdit?: () => void }) {
  const { t } = useT();
  return (
    <div className="flex items-center justify-between border-b py-4">
      <div><div className="text-xs text-muted">{label}</div><div className="text-sm font-semibold">{value || "—"}</div></div>
      {onEdit && <button onClick={onEdit} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium hover:bg-surface2"><span className="flex h-9 w-9 items-center justify-center rounded-full border">✎</span>{t("edit_btn")}</button>}
    </div>
  );
}

function NotBuilt() {
  const { t } = useT();
  return <div className="rounded-2xl border border-dashed p-8 text-center"><p className="font-semibold">{t("not_built_title")}</p><p className="mx-auto mt-1 max-w-md text-sm text-muted">{t("not_built_body")}</p></div>;
}

export default function Page() {
  const { call, me } = useAuth();
  const { t } = useT();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("profile");
  const [edit, setEdit] = useState<null | "company_name" | "company_email" | "company_phone" | "first" | "last" | "password">(null);
  const [val, setVal] = useState(""); const [cur, setCur] = useState("");
  const editable = can.manageSettings(me?.role);
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => call<AppSettings>("/settings") });
  const acc = data?.account;
  const [first = "", ...rest] = (me?.full_name ?? "").split(" ");
  const last = rest.join(" ");

  const save = useMutation({
    mutationFn: async () => {
      if (!acc || !edit) return;
      if (edit === "first" || edit === "last") return call("/auth/me", { method: "PATCH", body: JSON.stringify({ full_name: (edit === "first" ? `${val} ${last}` : `${first} ${val}`).trim() }) });
      if (edit === "password") return call("/auth/me", { method: "PATCH", body: JSON.stringify({ current_password: cur, new_password: val }) });
      return call("/settings/account", { method: "PUT", body: JSON.stringify({ ...acc, [edit]: val }) });
    },
    onSuccess: () => { setEdit(null); setVal(""); setCur(""); qc.invalidateQueries({ queryKey: ["settings"] }); window.dispatchEvent(new Event("profile-changed")); },
  });
  const open = (k: NonNullable<typeof edit>, v: string) => { setEdit(k); setVal(v); setCur(""); save.reset(); };
  const labels = { company_name: t("company_name"), company_email: t("company_email"), company_phone: t("company_phone"), first: t("admin_name"), last: t("last_name"), password: t("password_label") };

  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-2xl font-bold">{t("my_account")}</h1>
      <div className="mb-6 flex gap-2 border-b">
        {([["profile", t("tab_profile")], ["billing", t("tab_billing")], ["transactions", t("tab_transactions")], ["methods", t("tab_payment_methods")]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-3 text-sm ${tab === k ? "border-ink font-semibold" : "border-transparent text-muted"}`}>{label}</button>))}
      </div>
      {tab !== "profile" ? <NotBuilt /> : (
        <>
          {!editable && <p className="mb-2 text-xs text-muted">{t("read_only")}</p>}
          <Row label={t("company_name")} value={acc?.company_name ?? ""} onEdit={editable ? () => open("company_name", acc?.company_name ?? "") : undefined} />
          <Row label={t("company_email")} value={acc?.company_email ?? ""} onEdit={editable ? () => open("company_email", acc?.company_email ?? "") : undefined} />
          <Row label={t("company_phone")} value={acc?.company_phone ?? ""} onEdit={editable ? () => open("company_phone", acc?.company_phone ?? "") : undefined} />
          <div className="h-6" />
          <Row label={t("admin_name")} value={first} onEdit={() => open("first", first)} />
          <Row label={t("last_name")} value={last} onEdit={() => open("last", last)} />
          <Row label={t("email")} value={me?.email ?? ""} />
          <Row label={t("password_label")} value="••••••••" onEdit={() => open("password", "")} />
        </>)}
      {edit && (
        <Modal title={labels[edit]} onClose={() => setEdit(null)}>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            {edit === "password" && <Field label={t("current_password")}><input className={inputCls} type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required /></Field>}
            <Field label={edit === "password" ? t("new_password") : labels[edit]}><input className={inputCls} type={edit === "password" ? "password" : "text"} autoComplete={edit === "password" ? "new-password" : "off"} minLength={edit === "password" ? 8 : undefined} value={val} onChange={(e) => setVal(e.target.value)} required={edit === "password" || edit === "company_name"} /></Field>
            <ErrorText error={save.error} />
            <Button className="w-full" disabled={save.isPending}>{t("save")}</Button>
          </form>
        </Modal>)}
    </div>
  );
}
