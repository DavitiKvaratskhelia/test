"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { alertList } from "@/lib/alerts";
import { can, useAuth } from "@/lib/auth";
import { Key, useT } from "@/lib/i18n";
import type { Order } from "@/lib/types";
import { IconBell, IconPin, IconPlus } from "./icons";
import PinModal from "./PinModal";
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
          <Logo />
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

const Logo = () => (
  <Link href="/" className="flex items-center gap-2.5">
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-lg font-bold text-brand-on">Z</span>
    <span className="text-lg font-semibold tracking-tight">Zoommer</span>
  </Link>
);

const NAV: { href: string; key: Key; match: (p: string) => boolean; visible?: (r?: string) => boolean }[] = [
  { href: "/", key: "nav_active", match: (p) => p === "/" },
  { href: "/orders", key: "nav_history", match: (p) => p === "/orders" },
  { href: "/couriers", key: "nav_couriers", match: (p) => p.startsWith("/couriers"), visible: can.fleet },
  { href: "/analytics", key: "nav_analytics", match: (p) => p.startsWith("/analytics") },
];

function Bell() {
  const { call, me } = useAuth();
  const { t } = useT();
  const orders = useQuery({ queryKey: ["orders"], enabled: !!me && me.role !== "courier", queryFn: () => call<Order[]>("/orders?limit=500"), refetchInterval: 30000 });
  const alerts = alertList(orders.data ?? []);
  return (
    <details className="relative">
      <summary aria-label={t("recent_alerts")} className="relative flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border hover:bg-surface2">
        <IconBell />{alerts.length > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-on">{alerts.length}</span>}
      </summary>
      <div className="absolute right-0 z-[3000] mt-2 w-72 rounded-2xl border bg-pop p-3 shadow-xl">
        <h3 className="mb-2 text-sm font-semibold">{t("recent_alerts")}</h3>
        <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
          {alerts.slice(0, 8).map((a) => (
            <li key={a.key}><Link href="/orders" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface2">
              <i className={`h-2.5 w-2.5 rounded-full ${a.tone === "red" ? "bg-red-500" : "bg-amber-500"}`} /><span className="font-medium">#{a.ref}</span><span className="text-xs text-muted">{a.kind === "failed" ? t("alert_failed") : t("alert_unassigned")}</span></Link></li>))}
          {alerts.length === 0 && <li className="text-muted">{t("no_alerts")}</li>}
        </ul>
      </div>
    </details>
  );
}

function AvatarMenu() {
  const { me, logout } = useAuth();
  const { t, lang, setLang } = useT();
  const name = (me?.full_name || me?.email || "?");
  return (
    <details className="relative">
      <summary aria-label="account" className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full bg-brand text-sm font-semibold uppercase text-brand-on">{name[0]}</summary>
      <div className="absolute right-0 z-[3000] mt-2 w-64 rounded-2xl border bg-pop p-2 text-sm shadow-xl">
        <div className="border-b px-3 py-2"><div className="truncate font-medium">{name}</div><div className="truncate text-xs text-muted">{me?.email} · {me?.role}</div></div>
        <Link href="/settings/account" className="block rounded-lg px-3 py-2 hover:bg-surface2">{t("nav_settings")}</Link>
        <div className="flex items-center justify-between px-3 py-2"><span>{t("language")}</span><button className="rounded-lg border px-2 py-1 text-xs" aria-label="language" onClick={() => setLang(lang === "en" ? "ka" : "en")}>{lang === "en" ? "ქართ" : "EN"}</button></div>
        <div className="flex items-center justify-between px-3 py-2"><span>{t("dark_mode")}</span><ThemeToggle /></div>
        <button className="block w-full rounded-lg px-3 py-2 text-left text-red-600 hover:bg-surface2" onClick={logout}>{t("sign_out")}</button>
      </div>
    </details>
  );
}

export default function AppShell({ children, fullHeight = false }: { children: React.ReactNode; title?: string; fullHeight?: boolean }) {
  const { token, me, ready } = useAuth();
  const { t } = useT();
  const path = usePathname();
  const [pinOpen, setPinOpen] = useState(false);
  if (!ready) return <div className="p-8 text-sm text-muted">…</div>;
  if (!token) return <Login />;
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-app">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-5 py-3 lg:px-8">
        <Logo />
        <nav className="order-3 flex w-full items-center gap-1 overflow-x-auto lg:order-none lg:w-auto">
          {NAV.filter((n) => !n.visible || n.visible(me?.role)).map((n) => (
            <Link key={n.key} href={n.href} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm ${n.match(path) ? "bg-brand-light font-medium text-brand-text" : "text-ink hover:bg-surface2"}`}>{t(n.key)}</Link>))}
        </nav>
        <div className="flex items-center gap-3">
          {can.createOrder(me?.role) && (
            <button onClick={() => setPinOpen(true)} className="hidden h-11 items-center gap-2 rounded-xl bg-solo px-4 text-sm font-medium text-white hover:bg-solo-hover sm:flex"><IconPin className="!h-4 !w-4" />{t("get_pin")}</button>)}
          {can.createOrder(me?.role) && (
            <Link href="/orders/new" className="flex h-11 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-on hover:bg-brand-hover"><IconPlus className="!h-4 !w-4" />{t("order_word")}</Link>)}
          <Bell />
          <AvatarMenu />
        </div>
      </header>
      <div className={`flex min-h-0 flex-1 flex-col ${fullHeight ? "overflow-hidden" : "overflow-y-auto"}`}>{children}</div>
      {pinOpen && <PinModal onClose={() => setPinOpen(false)} />}
    </div>
  );
}
