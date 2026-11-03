"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { alertCount } from "@/lib/alerts";
import { can, useAuth } from "@/lib/auth";
import { Key, useT } from "@/lib/i18n";
import type { Order } from "@/lib/types";
import { IconAnalytics, IconBell, IconChevronsLeft, IconChevronsRight, IconCouriers, IconDashboard, IconLogout, IconMap, IconMenu, IconOrders, IconPlus, IconReports, IconSettings, IconX } from "./icons";
import ThemeToggle from "./ThemeToggle";
import { Button, inputCls } from "./ui";

function Login() {
  const { login } = useAuth();
  const { t, lang, setLang } = useT();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-4">
      <form className="w-full max-w-sm space-y-3 rounded-2xl border bg-app p-6" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr("");
        try { await login(email, password); } catch { setErr(t("bad_login")); } finally { setBusy(false); }
      }}>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Zoommer <span className="text-brand">Dispatch</span></h1>
          <span className="flex items-center gap-2"><ThemeToggle /><button type="button" className="text-xs text-muted underline" onClick={() => setLang(lang === "en" ? "ka" : "en")}>{lang === "en" ? "ქართ" : "EN"}</button></span>
        </div>
        <input className={inputCls} placeholder={t("email")} aria-label={t("email")} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        <input className={inputCls} type="password" placeholder={t("password")} aria-label={t("password")} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
        <Button className="w-full" disabled={busy}>{t("sign_in")}</Button>
      </form>
    </main>
  );
}

type Item = { href: string; key: Key; icon: React.ReactNode; match: (p: string) => boolean; visible?: (r?: string) => boolean; soon?: boolean };
const MAIN: Item[] = [
  { href: "/", key: "nav_dashboard", icon: <IconDashboard />, match: (p) => p === "/" },
  { href: "/orders", key: "nav_orders", icon: <IconOrders />, match: (p) => p === "/orders" || p === "/orders/new" },
  { href: "/shipments", key: "nav_map", icon: <IconMap />, match: (p) => p.startsWith("/shipments"), visible: can.fleet },
  { href: "/couriers", key: "nav_couriers", icon: <IconCouriers />, match: (p) => p.startsWith("/couriers"), visible: can.fleet },
];
const SECOND: Item[] = [
  { href: "/settings/addresses", key: "nav_settings", icon: <IconSettings />, match: (p) => p.startsWith("/settings") },
  { href: "#", key: "nav_reports", icon: <IconReports />, match: () => false, soon: true },
  { href: "#", key: "nav_analytics", icon: <IconAnalytics />, match: () => false, soon: true },
];

function NavGroup({ items, collapsed, onNavigate }: { items: Item[]; collapsed: boolean; onNavigate?: () => void }) {
  const { me } = useAuth();
  const { t } = useT();
  const path = usePathname();
  return (
    <div className="flex flex-col gap-1">
      {items.filter((i) => !i.visible || i.visible(me?.role)).map((i) => {
        const base = `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${collapsed ? "justify-center" : ""}`;
        return i.soon ? (
          <span key={i.key} title={t("soon")} className={`${base} cursor-not-allowed text-white/35`}>{i.icon}{!collapsed && t(i.key)}</span>
        ) : (
          <Link key={i.key} href={i.href} onClick={onNavigate} title={collapsed ? t(i.key) : undefined}
            className={`${base} transition ${i.match(path) ? "bg-white/10 font-medium text-white" : "text-white/70 hover:bg-white/5 hover:text-white"}`}>
            <span className={i.match(path) ? "text-brand" : ""}>{i.icon}</span>{!collapsed && t(i.key)}
          </Link>
        );
      })}
    </div>
  );
}

function Sidebar({ collapsed, onToggle, onNavigate, closeBtn }: { collapsed: boolean; onToggle?: () => void; onNavigate?: () => void; closeBtn?: () => void }) {
  const { me, logout, call } = useAuth();
  const { t } = useT();
  const orders = useQuery({ queryKey: ["orders"], enabled: can.createOrder(me?.role) || me?.role === "finance_manager", queryFn: () => call<Order[]>("/orders?limit=500"), refetchInterval: 30000 });
  const n = alertCount(orders.data ?? []);
  const name = (me?.email ?? "").split("@")[0];
  return (
    <aside className={`flex h-full flex-col rounded-2xl bg-side p-3 text-white ${collapsed ? "w-[76px]" : "w-64"}`}>
      <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between"} px-1 pb-3`}>
        {!collapsed && <span className="flex items-center gap-2.5"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-base font-bold text-brand-on">Z</span><span className="leading-tight"><span className="block text-sm font-semibold">Zoommer</span><span className="block text-xs text-white/50">Dispatch</span></span></span>}
        {closeBtn ? <button aria-label={t("close")} onClick={closeBtn} className="text-white/70"><IconX /></button>
          : <button aria-label="collapse" onClick={onToggle} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10">{collapsed ? <IconChevronsRight /> : <IconChevronsLeft />}</button>}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto">
        <NavGroup items={MAIN} collapsed={collapsed} onNavigate={onNavigate} />
        <hr className="border-white/10" />
        <NavGroup items={SECOND} collapsed={collapsed} onNavigate={onNavigate} />
        <hr className="border-white/10" />
        <Link href="/" onClick={onNavigate} title={t("recent_alerts")} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/70 hover:bg-white/5 hover:text-white ${collapsed ? "justify-center" : ""}`}>
          <span className="relative"><IconBell />{n > 0 && collapsed && <i className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-brand" />}</span>
          {!collapsed && <><span className="flex-1">{t("recent_alerts")}</span>{n > 0 && <span className="rounded-md bg-brand px-1.5 py-0.5 text-[11px] font-semibold text-brand-on">{n}</span>}</>}
        </Link>
      </div>
      <div className={`mt-3 flex items-center gap-2.5 rounded-xl bg-white/5 p-2 ${collapsed ? "flex-col" : ""}`}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold uppercase text-brand-on" aria-hidden>{(name || "?")[0]}</span>
        {!collapsed && <span className="min-w-0 flex-1 leading-tight"><span className="block truncate text-sm font-medium">{name}</span><span className="block truncate text-xs text-white/50">{me?.role}</span></span>}
        <button aria-label={t("sign_out")} title={t("sign_out")} onClick={logout} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"><IconLogout /></button>
      </div>
    </aside>
  );
}

export default function AppShell({ children, title, fullHeight = false }: { children: React.ReactNode; title?: string; fullHeight?: boolean }) {
  const { token, me, ready } = useAuth();
  const { t, lang, setLang } = useT();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem("sidebar") === "1"); } catch {} }, []);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("sidebar", c ? "0" : "1"); } catch {} return !c; });
  if (!ready) return <div className="p-8 text-sm text-muted">…</div>;
  if (!token) return <Login />;
  return (
    <div className="flex h-screen gap-3 overflow-hidden bg-surface p-3">
      <div className="hidden lg:block"><Sidebar collapsed={collapsed} onToggle={toggle} /></div>
      {drawer && (
        <div className="fixed inset-0 z-[3000] lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && setDrawer(false)}>
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <div className="relative h-full p-3"><Sidebar collapsed={false} onNavigate={() => setDrawer(false)} closeBtn={() => setDrawer(false)} /></div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-app">
        <header className="flex items-center gap-3 px-5 py-4">
          <button aria-label="menu" className="rounded-xl border p-2 lg:hidden" onClick={() => setDrawer(true)}><IconMenu /></button>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <button className="h-9 rounded-xl border px-2.5 text-xs font-medium hover:bg-surface2" onClick={() => setLang(lang === "en" ? "ka" : "en")} aria-label="language">{lang === "en" ? "ქართ" : "EN"}</button>
            {can.createOrder(me?.role) && (
              <Link href="/orders/new" className="flex h-9 items-center gap-2 rounded-xl bg-solo px-3.5 text-sm font-medium text-white hover:bg-solo-hover"><IconPlus className="!h-4 !w-4" />{t("new_order")}</Link>
            )}
          </div>
        </header>
        <div className={`flex min-h-0 flex-1 flex-col ${fullHeight ? "overflow-hidden" : "overflow-y-auto"}`}>{children}</div>
      </div>
    </div>
  );
}
