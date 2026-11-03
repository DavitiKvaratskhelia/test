"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AppShell from "@/components/AppShell";
import { can, useAuth } from "@/lib/auth";
import { useT, Key } from "@/lib/i18n";

const ITEMS: { href: string; key: Key; icon: string; visible?: (r?: string) => boolean }[] = [
  { href: "/settings/account", key: "set_account", icon: "👤" },
  { href: "/settings/addresses", key: "set_addresses", icon: "📍", visible: can.addresses },
  { href: "/settings/delivery", key: "set_delivery", icon: "📦" },
  { href: "/settings/payment", key: "set_payment", icon: "💳" },
  { href: "/settings/geofencing", key: "set_geofencing", icon: "🗺️", visible: can.fleet },
  { href: "/settings/geolocation", key: "set_geolocation", icon: "🌐" },
  { href: "/settings/team", key: "set_team", icon: "👥", visible: can.manageUsers },
];

function Sidebar() {
  const { me } = useAuth();
  const { t } = useT();
  const path = usePathname();
  return (
    <aside className="w-full shrink-0 border-b bg-white md:w-64 md:border-b-0 md:border-r">
      <h2 className="px-5 py-4 font-semibold">{t("parameters")}</h2>
      <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible md:pb-0">
        {ITEMS.filter((i) => !i.visible || i.visible(me?.role)).map((i) => (
          <Link key={i.href} href={i.href} className={`flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm ${path === i.href ? "bg-brand-light font-medium text-brand-dark" : "text-neutral-700 hover:bg-neutral-100"}`}>
            <span aria-hidden>{i.icon}</span>{t(i.key)}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <div className="flex min-h-[calc(100vh-57px)] flex-col md:flex-row">
        <Sidebar />
        <div className="min-w-0 flex-1 p-4 md:p-8">{children}</div>
      </div>
    </AppShell>
  );
}
