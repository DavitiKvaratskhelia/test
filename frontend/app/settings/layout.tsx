"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AppShell from "@/components/AppShell";
import { can, useAuth } from "@/lib/auth";
import { Key, useT } from "@/lib/i18n";

const ITEMS: { href: string; key: Key; icon: string; visible?: (r?: string) => boolean }[] = [
  { href: "/settings/account", key: "set_account", icon: "👤" },
  { href: "/settings/addresses", key: "set_addresses", icon: "📍", visible: can.addresses },
  { href: "/settings/payment", key: "set_payment", icon: "💳" },
  { href: "/settings/delivery", key: "set_delivery", icon: "📦" },
  { href: "/settings/geofencing", key: "set_geofencing", icon: "🗺️", visible: can.fleet },
  { href: "/settings/geolocation", key: "set_geolocation", icon: "🌐" },
  { href: "/settings/team", key: "set_team", icon: "👥", visible: can.manageUsers },
  { href: "/settings/integration", key: "set_integration", icon: "🧩" },
  { href: "/settings/terms", key: "set_terms", icon: "📄" },
  { href: "/settings/courier-terms", key: "set_courier_terms", icon: "📑" },
];

function Sidebar() {
  const { me } = useAuth();
  const { t } = useT();
  const path = usePathname();
  return (
    <aside className="w-full shrink-0 border-b bg-app md:w-72 md:border-b-0 md:border-r">
      <h2 className="px-6 py-5 text-lg font-bold">{t("parameters")}</h2>
      <nav className="flex gap-1 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0">
        {ITEMS.filter((i) => !i.visible || i.visible(me?.role)).map((i) => (
          <Link key={i.href} href={i.href} className={`flex items-center gap-3 whitespace-nowrap border-l-4 px-6 py-3.5 text-sm ${path === i.href ? "border-ink bg-surface font-semibold" : "border-transparent text-ink hover:bg-surface"}`}>
            <span aria-hidden className="w-5 text-center">{i.icon}</span>{t(i.key)}
          </Link>))}
      </nav>
    </aside>
  );
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <div className="flex min-h-full flex-col md:flex-row">
        <Sidebar />
        <div className="min-w-0 flex-1 px-6 pb-10 pt-6 md:px-10">{children}</div>
      </div>
    </AppShell>
  );
}
