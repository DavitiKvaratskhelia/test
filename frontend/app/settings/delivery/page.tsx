"use client";
import SettingsForm from "@/components/SettingsForm";
import { useT } from "@/lib/i18n";

export default function Page() {
  const { t } = useT();
  return <SettingsForm group="delivery" title={t("set_delivery")} fields={[
    { name: "default_service_time_s", label: "service_time", type: "number" },
    { name: "max_active_orders_per_courier", label: "max_orders", type: "number" },
    { name: "late_threshold_min", label: "late_min", type: "number" },
    { name: "auto_dispatch", label: "auto_dispatch", type: "bool" },
  ]} />;
}
