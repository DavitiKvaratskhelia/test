"use client";
import { Button } from "./ui";

export function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number | string; sub?: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border bg-surface p-4 shadow-sm">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-solo text-white">{icon}</span>
      <div className="min-w-0">
        <div className="truncate text-xs text-muted">{label}</div>
        <div className="text-2xl font-semibold leading-tight">{value}</div>
        {sub && <div className="text-xs text-muted">{sub}</div>}
      </div>
    </div>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = (name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return <span style={{ width: size, height: size }} className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-light text-xs font-semibold text-brand-text" aria-hidden>{initials}</span>;
}

export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const nums: (number | "…")[] = [];
  for (let i = 0; i < pages; i++) {
    if (i === 0 || i === pages - 1 || Math.abs(i - page) <= 1) nums.push(i); else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  return (
    <div className="flex items-center gap-1.5">
      <Button variant="secondary" className="!px-3" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="prev">‹</Button>
      {nums.map((n, i) => n === "…" ? <span key={`e${i}`} className="px-1 text-muted">…</span> : (
        <button key={n} onClick={() => onPage(n)} aria-current={n === page ? "page" : undefined}
          className={`h-9 w-9 rounded-full text-sm ${n === page ? "bg-solo font-medium text-white" : "text-muted hover:bg-surface2"}`}>{n + 1}</button>
      ))}
      <Button variant="secondary" className="!px-3" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)} aria-label="next">›</Button>
    </div>
  );
}
