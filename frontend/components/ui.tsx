"use client";
import { useEffect } from "react";
import { useT } from "@/lib/i18n";

export function Button({ variant = "primary", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "accent" | "dark" | "secondary" | "danger" | "ghost" }) {
  const v = {
    primary: "bg-solo text-white hover:bg-solo-hover",   // dark brand colour, used where the reference design uses black
    accent: "bg-brand text-brand-on hover:bg-brand-hover",
    dark: "bg-solo text-white hover:bg-solo-hover",
    secondary: "border bg-app text-ink hover:bg-surface2",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-muted hover:bg-surface2",
  }[variant];
  return <button {...p} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${v} ${className}`} />;
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls = "w-full rounded-xl border bg-app px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:bg-surface2";

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const { t } = useT();
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-3" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label={title} className={`flex max-h-[95vh] w-full flex-col overflow-hidden rounded-2xl bg-pop shadow-xl ${wide ? "max-w-5xl" : "max-w-lg"}`}>
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button aria-label={t("close")} onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-surface2">✕</button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

const TONE = {
  orange: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-400/40 dark:bg-orange-500/15 dark:text-orange-300",
  blue: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-300",
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/40 dark:bg-indigo-500/15 dark:text-indigo-300",
  violet: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/40 dark:bg-violet-500/15 dark:text-violet-300",
  yellow: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300",
  green: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300",
  red: "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300",
  gray: "border-line bg-surface2 text-muted",
};
const STATUS_TONE: Record<string, keyof typeof TONE> = {
  new: "gray", ready: "orange", assigned: "blue", picked_up: "indigo", on_the_way: "violet", delivered: "green", failed: "red", returned: "yellow", cancelled: "gray",
};

/** Bordered status chip (reference style): in transit = blue, upcoming = yellow, delivered = green. */
export function StatusBadge({ status }: { status: string }) {
  const { t } = useT();
  return <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-medium ${TONE[STATUS_TONE[status] ?? "gray"]}`}>{t(`st_${status}` as Parameters<typeof t>[0])}</span>;
}

/** Square 40px icon button (mail / phone / locate …). */
export function IconButton({ label, children, className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button aria-label={label} title={label} {...p} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-app text-ink hover:bg-surface2 disabled:opacity-40 ${className}`}>{children}</button>;
}

/** Segmented pill tabs with count badges; the active tab uses the accent colour. */
export function PillTabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex items-center gap-1 rounded-2xl border bg-app p-1">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 py-2 text-xs font-medium transition ${value === t.id ? "bg-brand text-brand-on" : "text-muted hover:bg-surface2"}`}>
          {t.label}{t.count != null && <span className={`rounded-md px-1.5 py-0.5 text-[10px] ${value === t.id ? "bg-white/60 text-brand-on" : "bg-surface2"}`}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border bg-surface ${className}`}>{children}</div>;
}

export function ErrorText({ error }: { error: unknown }) {
  return error ? <p role="alert" className="text-sm text-red-600">{String((error as Error).message ?? error)}</p> : null;
}

export function Menu({ items }: { items: { label: string; onClick: () => void; danger?: boolean }[] }) {
  return (
    <details className="relative">
      <summary aria-label="menu" className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full text-muted hover:bg-surface2">⋯</summary>
      <div className="absolute right-0 z-20 mt-1 w-40 rounded-xl border bg-pop py-1 shadow-lg">
        {items.map((i) => (
          <button key={i.label} onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; i.onClick(); }}
            className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-surface2 ${i.danger ? "text-red-600" : ""}`}>{i.label}</button>
        ))}
      </div>
    </details>
  );
}
