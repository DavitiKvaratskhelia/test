"use client";
import { useT } from "@/lib/i18n";

// Honest status page: none of these has been tested with real partner credentials (see docs/INTEGRATIONS.md).
const CONNECTORS = ["Wolt Drive", "Glovo", "Go Delivery", "Deliverers", "OnWay", "Easy Way", "Georgian Post", "Shopify", "WooCommerce", "Open API"];

export default function Page() {
  const { t } = useT();
  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-2xl font-bold">{t("set_integration")}</h1>
      <ul className="divide-y rounded-2xl border bg-app">
        {CONNECTORS.map((c) => <li key={c} className="flex items-center justify-between px-5 py-4 text-sm"><span className="font-medium">{c}</span><span className="rounded-lg border px-2.5 py-1 text-xs text-muted">{t("not_connected_status")}</span></li>)}
      </ul>
      <p className="mt-3 text-xs text-muted">{t("not_built_body")}</p>
    </div>
  );
}
