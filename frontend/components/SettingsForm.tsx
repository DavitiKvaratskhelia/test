"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { can, useAuth } from "@/lib/auth";
import { Key, useT } from "@/lib/i18n";
import type { AppSettings } from "@/lib/types";
import { Button, Card, ErrorText, Field, inputCls } from "./ui";

export type FieldDef = { name: string; label: Key; type: "number" | "text" | "bool" | "select"; options?: [string, string][]; step?: number };

export default function SettingsForm({ group, title, fields, note }: { group: keyof AppSettings; title: string; fields: FieldDef[]; note?: string }) {
  const { call, me } = useAuth();
  const { t } = useT();
  const qc = useQueryClient();
  const editable = can.manageSettings(me?.role);
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => call<AppSettings>("/settings") });
  const [form, setForm] = useState<Record<string, string | number | boolean>>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (data) setForm(data[group] as unknown as Record<string, string | number | boolean>); }, [data, group]);
  const save = useMutation({
    mutationFn: () => call(`/settings/${group}`, { method: "PUT", body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings"] }); setSaved(true); setTimeout(() => setSaved(false), 2000); },
  });
  if (!data) return <p className="text-sm text-neutral-500">{t("loading")}</p>;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      {note && <p className="rounded-lg bg-neutral-100 p-3 text-xs text-neutral-600">{note}</p>}
      {!editable && <p className="text-xs text-neutral-500">{t("read_only")}</p>}
      <Card className="space-y-4 p-5">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          {fields.map((f) => (
            <Field key={f.name} label={t(f.label)}>
              {f.type === "bool" ? (
                <input type="checkbox" disabled={!editable} checked={Boolean(form[f.name])} onChange={(e) => setForm({ ...form, [f.name]: e.target.checked })} />
              ) : f.type === "select" ? (
                <select className={inputCls} disabled={!editable} value={String(form[f.name] ?? "")} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}>
                  {f.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              ) : (
                <input className={inputCls} disabled={!editable} type={f.type} step={f.step} value={String(form[f.name] ?? "")}
                  onChange={(e) => setForm({ ...form, [f.name]: f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value })} />
              )}
            </Field>
          ))}
          <ErrorText error={save.error} />
          {editable && <div className="flex items-center gap-3"><Button disabled={save.isPending}>{t("save")}</Button>{saved && <span className="text-sm text-green-600">✓ {t("saved")}</span>}</div>}
        </form>
      </Card>
    </div>
  );
}
