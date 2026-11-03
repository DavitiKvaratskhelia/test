"use client";
import SettingsForm from "@/components/SettingsForm";
import { useT } from "@/lib/i18n";

export default function Page() {
  const { t } = useT();
  return <SettingsForm group="payment" title={t("set_payment")} note={t("payment_note")} fields={[
    { name: "currency", label: "currency", type: "text" },
    { name: "base_rate", label: "base_rate", type: "number", step: 0.01 },
    { name: "per_km_rate", label: "per_km", type: "number", step: 0.01 },
  ]} />;
}
