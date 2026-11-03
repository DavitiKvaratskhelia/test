"use client";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

/** Light/dark switch. The initial class is set by an inline script in layout.tsx (no flash); this only toggles + persists. */
export default function ThemeToggle() {
  const { t } = useT();
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.classList.contains("dark")); }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch {}
  };
  return (
    <button onClick={toggle} aria-label={dark ? t("light_mode") : t("dark_mode")} title={dark ? t("light_mode") : t("dark_mode")}
      className="flex h-8 w-8 items-center justify-center rounded-full border text-base hover:bg-surface2">{dark ? "☀" : "☾"}</button>
  );
}
