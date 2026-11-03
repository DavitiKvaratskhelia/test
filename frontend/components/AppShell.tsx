"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { can, useAuth } from "@/lib/auth";
import { Key, useT } from "@/lib/i18n";
import { IconAnalytics, IconCouriers, IconDashboard, IconMap, IconMenu, IconOrders, IconPlus, IconReports, IconSearch, IconSettings, IconX } from "./icons";
import ThemeToggle from "./ThemeToggle";
import { Button, inputCls } from "./ui";

function Login() {
  const { login } = useAuth();
  const { t, lang, setLang } = useT();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form className="w-full max-w-sm space-y-3 rounded-2xl border bg-surface p-6 shadow-sm" onSubmit={async (e) => {
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
        <Button variant="dark" className="w-full" disabled={busy}>{t("sign_in")}</Button>
      </form>
    </main>
  );
}

type Item = { href: string; key: Key; icon: React.ReactNode; match: (p: string) => boolean; visible?: (r?: string) => boolean; soon?: boolean };
const NAV: Item[] = [
  { href: "/", key: "nav_dashboard", icon: <IconDashboard />, match: (p) => p === "/" },
  { href: "/orders", key: "nav_orders", icon: <IconOrders />, match: (p) => p.startsWith("/orders") },
  { href: "/shipments", key: "nav_map", icon: <IconMap />, match: (p) => p.startsWith("/shipments"), visible: can.fleet },
  { href: "/couriers", key: "nav_couriers", icon: <IconCouriers />, match: (p) => p.startsWith("/couriers"), visible: can.fleet },
  { href: "/settings/addresses", key: "nav_settings", icon: <IconSettings />, match: (p) => p.startsWith("/settings") },
  { href: "#", key: "nav_reports", icon: <IconReports />, match: () => false, soon: true },
  { href: "#", key: "nav_analytics", icon: <IconAnalytics />, match: () => false, soon: true },
];

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const { me } = useAuth();
  const { t } = useT();
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV.filter((i) => !i.visible || i.visible(me?.role)).map((i) => i.soon ? (
        <span key={i.key} title={t("soon")} className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted/60">{i.icon}{t(i.key)}</span>
      ) : (
        <Link key={i.key} href={i.href} onClick={onNavigate}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${i.match(path) ? "bg-solo font-medium text-white" : "text-muted hover:bg-surface2 hover:text-ink"}`}>
          {i.icon}{t(i.key)}
        </Link>
      ))}
    </nav>
  );
}

const Logo = () => <span className="px-6 py-5 text-lg font-bold tracking-tight">Zoommer <span className="text-brand">Dispatch</span></span>;

export default function AppShell({ children, title, fullHeight = false }: { children: React.ReactNode; title?: string; fullHeight?: boolean }) {
  const { token, me, ready, logout } = useAuth();
  const { t, lang, setLang } = useT();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [q, setQ] = useState("");
  if (!ready) return <div className="p-8 text-sm text-muted">…</div>;
  if (!token) return <Login />;
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-surface lg:flex"><Logo /><Nav /></aside>
      {drawer && (
        <div className="fixed inset-0 z-[3000] lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && setDrawer(false)}>
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <aside className="relative flex h-full w-64 flex-col bg-surface shadow-xl">
            <div className="flex items-center justify-between pr-3"><Logo /><button aria-label={t("close")} onClick={() => setDrawer(false)}><IconX /></button></div>
            <Nav onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b bg-surface px-4 py-3">
          <button aria-label="menu" className="rounded-lg border p-2 lg:hidden" onClick={() => setDrawer(true)}><IconMenu /></button>
          <h1 className="mr-2 text-lg font-semibold">{title}</h1>
          <form className="relative min-w-[200px] max-w-md flex-1" onSubmit={(e) => { e.preventDefault(); router.push(`/orders?q=${encodeURIComponent(q)}`); }}>
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className={`${inputCls} rounded-full bg-surface2 pl-10`} placeholder={t("search_global")} aria-label={t("search_global")} value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
          <div className="ml-auto flex items-center gap-2 text-xs">
            {can.createOrder(me?.role) && (
              <Link href="/orders/new" className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover"><IconPlus className="!h-4 !w-4" />{t("new_order")}</Link>
            )}
            <ThemeToggle />
            <button className="rounded border px-2 py-1.5" onClick={() => setLang(lang === "en" ? "ka" : "en")} aria-label="language">{lang === "en" ? "ქართ" : "EN"}</button>
            <span className="hidden items-center gap-2 sm:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-solo text-xs font-semibold uppercase text-white" aria-hidden>{(me?.email ?? "?")[0]}</span>
              <span className="leading-tight"><span className="block max-w-[160px] truncate">{me?.email}</span><span className="block text-muted">{me?.role}</span></span>
            </span>
            <button className="text-muted underline" onClick={logout}>{t("sign_out")}</button>
          </div>
        </header>
        <div className={`flex min-h-0 flex-1 flex-col ${fullHeight ? "overflow-hidden" : "overflow-y-auto"}`}>{children}</div>
      </div>
    </div>
  );
}
