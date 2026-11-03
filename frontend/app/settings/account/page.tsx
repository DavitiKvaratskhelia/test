"use client";
import SettingsForm from "@/components/SettingsForm";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";

export default function Page() {
  const { t } = useT();
  const { me } = useAuth();
  return (
    <div className="space-y-4">
      <p className="mx-auto max-w-2xl text-sm text-neutral-500">{t("me_signed")}: <b>{me?.email}</b> ({me?.role})</p>
      <SettingsForm group="account" title={t("set_account")} fields={[
        { name: "company_name", label: "company", type: "text" },
        { name: "default_locale", label: "language", type: "select", options: [["ka", "ქართული"], ["en", "English"]] },
        { name: "timezone", label: "timezone", type: "text" },
      ]} />
    </div>
  );
}
