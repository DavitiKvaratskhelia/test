"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { SavedAddress } from "@/lib/types";

/** Free-text address input whose dropdown lists the pre-saved addresses (filtered as you type). */
export default function AddressField({ label, icon, value, onText, onSelect, onFocus, active, align = "left" }: {
  label: string; icon: React.ReactNode; value: string; active?: boolean; align?: "left" | "right";
  onText: (v: string) => void; onSelect: (a: SavedAddress) => void; onFocus?: () => void;
}) {
  const { call } = useAuth();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const { data } = useQuery({ queryKey: ["addresses-all"], queryFn: () => call<{ items: SavedAddress[] }>("/addresses?limit=100"), staleTime: 60000 });

  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const q = value.trim().toLowerCase();
  const items = (data?.items ?? []).filter((a) => !q || [a.name, a.address, a.phone].some((v) => v?.toLowerCase().includes(q)));

  return (
    <div ref={box} className="relative">
      <div className={`flex items-center gap-3 rounded-xl border bg-surface px-3 py-2 ${active ? "ring-2 ring-brand/40" : ""}`}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface2 text-muted" aria-hidden>{icon}</span>
        <input className="w-full min-w-0 bg-transparent py-2 text-sm outline-none" placeholder={label} aria-label={label} value={value} autoComplete="off"
          onFocus={() => { setOpen(true); onFocus?.(); }} onChange={(e) => { onText(e.target.value); setOpen(true); }}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)} />
      </div>
      {open && (
        <div role="listbox" aria-label={t("saved_hint")} className={`absolute z-[1600] mt-1 max-h-72 w-[460px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border bg-surface p-2 shadow-xl ${align === "right" ? "right-0" : "left-0"}`}>
          <p className="px-2 py-1 text-xs font-semibold text-brand-text">{t("saved_hint")}</p>
          {items.map((a) => (
            <button key={a.id} type="button" role="option" aria-selected={false}
              onMouseDown={(e) => e.preventDefault()} onClick={() => { onSelect(a); setOpen(false); }}
              className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface2">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface2 text-xs">📍</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{a.name}</span>
                <span className="block truncate text-xs text-muted">{a.address}{a.phone ? ` · ${a.phone}` : ""}</span>
              </span>
            </button>
          ))}
          {items.length === 0 && <p className="px-2 py-3 text-sm text-muted">{t("no_saved")}</p>}
        </div>
      )}
    </div>
  );
}
