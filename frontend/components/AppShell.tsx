"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { Button, inputCls } from "./ui";

function Login() {
  const { login } = useAuth();
  const { t, lang, setLang } = useT();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form className="w-full max-w-sm space-y-3 rounded-2xl border bg-white p-6 shadow-sm" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr("");
        try { await login(email, password); } catch { setErr(t("bad_login")); } finally { setBusy(false); }
      }}>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Zoommer <span className="text-brand">Dispatch</span></h1>
          <button type="button" className="text-xs text-neutral-500 underline" onClick={() => setLang(lang === "en" ? "ka" : "en")}>{lang === "en" ? "ქართ" : "EN"}</button>
        </div>
        <input className={inputCls} placeholder={t("email")} aria-label={t("email")} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        <input className={inputCls} type="password" placeholder={t("password")} aria-label={t("password")} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
        <Button className="w-full" disabled={busy}>{t("sign_in")}</Button>
      </form>
    </main>
  );
}

export default function AppShell({ children, fullHeight = false }: { children: React.ReactNode; fullHeight?: boolean }) {
  const { token, me, ready, logout } = useAuth();
  const { t, lang, setLang } = useT();
  const path = usePathname();
  if (!ready) return <div className="p-8 text-sm text-neutral-500">…</div>;
  if (!token) return <Login />;
  const links = [
    { href: "/", label: t("nav_active"), on: path === "/" },
    { href: "/history", label: t("nav_history"), on: path.startsWith("/history") },
    { href: "/couriers", label: t("nav_couriers"), on: path.startsWith("/couriers") },
    { href: "/settings/addresses", label: t("nav_settings"), on: path.startsWith("/settings") },
  ];
  return (
    <div className={fullHeight ? "flex h-screen flex-col" : "min-h-screen"}>
      <header className="sticky top-0 z-[1500] flex flex-wrap items-center justify-between gap-2 border-b bg-white px-4 py-2">
        <Link href="/" className="text-lg font-semibold">Zoommer <span className="text-brand">Dispatch</span></Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`rounded-full px-3 py-1.5 ${l.on ? "bg-brand-light font-medium text-brand-dark" : "text-neutral-700 hover:bg-neutral-100"}`}>{l.label}</Link>
          ))}
          <span title={t("soon")} className="cursor-not-allowed rounded-full px-3 py-1.5 text-neutral-400">{t("nav_analytics")}</span>
        </nav>
        <div className="flex items-center gap-3 text-xs">
          <button className="rounded border px-2 py-1" onClick={() => setLang(lang === "en" ? "ka" : "en")} aria-label="language">{lang === "en" ? "ქართ" : "EN"}</button>
          <span className="hidden text-neutral-500 sm:inline">{me?.email} · {me?.role}</span>
          <button className="text-neutral-500 underline" onClick={logout}>{t("sign_out")}</button>
        </div>
      </header>
      {children}
    </div>
  );
}
