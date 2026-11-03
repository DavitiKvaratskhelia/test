"use client";
import SettingsForm from "@/components/SettingsForm";
import { useT } from "@/lib/i18n";

export default function Page() {
  const { t } = useT();
  return <SettingsForm group="geolocation" title={t("set_geolocation")} note={t("geo_note")} fields={[
    { name: "gps_interval_s", label: "gps_interval", type: "number" },
    { name: "realtime_max_age_s", label: "realtime_age", type: "number" },
    { name: "delayed_max_age_s", label: "delayed_age", type: "number" },
    { name: "retention_days", label: "retention", type: "number" },
  ]} />;
}
