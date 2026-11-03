"use client";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { IconMoon, IconSun } from "./icons";

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
      className="flex h-9 w-9 items-center justify-center rounded-xl border hover:bg-surface2">{dark ? <IconSun className="!h-4 !w-4" /> : <IconMoon className="!h-4 !w-4" />}</button>
  );
}
