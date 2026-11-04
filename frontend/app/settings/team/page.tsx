"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Card, ErrorText, Field, Modal, inputCls } from "@/components/ui";
import { can, useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { Branch, RoleInfo, UserRow } from "@/lib/types";

type Draft = { email: string; password: string; role: string; full_name: string; branch_ids: number[] };

function UserModal({ user, roles, onClose }: { user?: UserRow; roles: RoleInfo[]; onClose: () => void }) {
  const { call } = useAuth();
  const { t } = useT();
  const qc = useQueryClient();
  const branches = useQuery({ queryKey: ["branches"], queryFn: () => call<Branch[]>("/branches") });
  const [d, setD] = useState<Draft>({ email: user?.email ?? "", password: "", role: user?.role ?? "dispatcher", full_name: user?.full_name ?? "", branch_ids: user?.branch_ids ?? [] });
  const save = useMutation({
    mutationFn: () => user
      ? call(`/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ role: d.role, full_name: d.full_name, branch_ids: d.branch_ids, ...(d.password ? { password: d.password } : {}) }) })
      : call("/users", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); onClose(); },
  });
  return (
    <Modal title={user ? t("edit") : t("add_user")} onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label={t("email")}><input className={inputCls} type="email" required disabled={!!user} value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></Field>
        <Field label={t("full_name")}><input className={inputCls} value={d.full_name} onChange={(e) => setD({ ...d, full_name: e.target.value })} /></Field>
        <Field label={t("role")} hint={roles.find((r) => r.name === d.role)?.description}>
          <select className={inputCls} value={d.role} onChange={(e) => setD({ ...d, role: e.target.value })}>{roles.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}</select>
        </Field>
        {d.role === "branch_operator" && (
          <Field group label={t("branches_for")}><span className="flex flex-wrap gap-3">{(branches.data ?? []).map((b) => <label key={b.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={d.branch_ids.includes(b.id)} onChange={() => setD({ ...d, branch_ids: d.branch_ids.includes(b.id) ? d.branch_ids.filter((x) => x !== b.id) : [...d.branch_ids, b.id] })} />{b.name}</label>)}</span></Field>)}
        <Field label={user ? t("reset_password") : t("password")} hint={user ? t("users_note") : t("must_change_body")}>
          <input className={inputCls} type="password" autoComplete="new-password" minLength={8} required={!user} value={d.password} onChange={(e) => setD({ ...d, password: e.target.value })} />
        </Field>
        <ErrorText error={save.error} />
        <Button className="w-full" disabled={save.isPending}>{user ? t("save") : t("add_user")}</Button>
      </form>
    </Modal>
  );
}

export default function Page() {
  const { call, me } = useAuth();
  const { t } = useT();
  const qc = useQueryClient();
  const allowed = can.manageUsers(me?.role);
  const [modal, setModal] = useState<{ user?: UserRow } | null>(null);
  const users = useQuery({ queryKey: ["users"], enabled: allowed, queryFn: () => call<UserRow[]>("/users") });
  const roles = useQuery({ queryKey: ["roles"], enabled: allowed, queryFn: () => call<RoleInfo[]>("/users/roles") });
  const toggle = useMutation({
    mutationFn: (u: UserRow) => call(`/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !u.is_active }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
  if (!allowed) return <p className="text-sm text-muted">{t("only_admin")}</p>;
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("team_title")}</h1>
        <Button variant="dark" onClick={() => setModal({})}>+ {t("add_user")}</Button>
      </div>
      <ErrorText error={toggle.error} />
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs text-muted"><tr><th className="p-3">{t("full_name")}</th><th>{t("email")}</th><th>{t("role")}</th><th>{t("status")}</th><th /></tr></thead>
          <tbody>
            {users.isLoading && <tr><td className="p-3 text-muted" colSpan={5}>{t("loading")}</td></tr>}
            {(users.data ?? []).map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="p-3">{u.full_name || "—"}</td><td>{u.email}</td>
                <td><span className="rounded-full bg-surface2 px-2 py-0.5 text-xs">{u.role}</span>{u.support_access && <span className="ml-2 rounded bg-brand-light px-1.5 text-[10px] text-brand-text">{t("support_badge")}</span>}</td>
                <td><span className={u.is_active ? "text-green-700" : "text-muted"}>{u.is_active ? t("active") : t("inactive")}</span></td>
                <td className="space-x-2 pr-3 text-right">
                  <Button variant="ghost" onClick={() => setModal({ user: u })}>{t("edit")}</Button>
                  <Button variant="ghost" disabled={u.id === me?.id} onClick={() => toggle.mutate(u)}>{u.is_active ? t("inactive") : t("active")}</Button>
                </td>
              </tr>))}
          </tbody>
        </table>
      </Card>
      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold">{t("roles")}</h2>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {(roles.data ?? []).map((r) => <div key={r.name}><dt className="inline font-medium">{r.name}</dt><dd className="inline text-muted"> — {r.description}</dd></div>)}
        </dl>
      </Card>
      {modal && roles.data && <UserModal key={modal.user?.id ?? "new"} user={modal.user} roles={roles.data} onClose={() => setModal(null)} />}
    </div>
  );
}
