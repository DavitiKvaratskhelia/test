"use client";
import { useEffect } from "react";
import { useT } from "@/lib/i18n";

export function Button({ variant = "primary", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "dark" | "secondary" | "danger" | "ghost" }) {
  const v = {
    primary: "bg-brand text-white hover:bg-brand-hover",
    dark: "bg-solo text-white hover:bg-solo-hover",  // dark brand colour, used where a reference design would use black
    secondary: "border border-line bg-surface text-ink hover:bg-surface2",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-muted hover:bg-surface2",
  }[variant];
  return <button {...p} className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${v} ${className}`} />;
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

export const inputCls = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:bg-surface2";

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const { t } = useT();
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-3" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label={title} className={`flex max-h-[95vh] w-full flex-col overflow-hidden rounded-2xl bg-surface shadow-xl ${wide ? "max-w-5xl" : "max-w-lg"}`}>
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button aria-label={t("close")} onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-surface2">✕</button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useT();
  const key = `st_${status}` as Parameters<typeof t>[0];
  const color: Record<string, string> = {
    new: "bg-surface2 text-ink",
    ready: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300",
    assigned: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300",
    picked_up: "bg-brand-light text-brand-text",
    delivered: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300",
    failed: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300",
    returned: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
    cancelled: "bg-line text-muted",
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${color[status] ?? color.new}`}>{t(key)}</span>;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-surface shadow-sm ${className}`}>{children}</div>;
}

export function ErrorText({ error }: { error: unknown }) {
  return error ? <p role="alert" className="text-sm text-red-600">{String((error as Error).message ?? error)}</p> : null;
}

export function Menu({ items }: { items: { label: string; onClick: () => void; danger?: boolean }[] }) {
  return (
    <details className="relative">
      <summary aria-label="menu" className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full text-muted hover:bg-surface2">⋯</summary>
      <div className="absolute right-0 z-20 mt-1 w-36 rounded-lg border bg-surface py-1 shadow-lg">
        {items.map((i) => (
          <button key={i.label} onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; i.onClick(); }}
            className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-surface2 ${i.danger ? "text-red-600" : ""}`}>{i.label}</button>
        ))}
      </div>
    </details>
  );
}
