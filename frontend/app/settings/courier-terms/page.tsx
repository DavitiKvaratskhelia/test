"use client";
import { useT } from "@/lib/i18n";

export default function Page() {
  const { t } = useT();
  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-2xl font-bold">{t("set_courier_terms")}</h1>
      <div className="rounded-2xl border border-dashed p-8 text-sm text-muted">{t("terms_pending")}</div>
    </div>
  );
}
