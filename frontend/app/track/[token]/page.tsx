"use client";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import { api } from "@/lib/api";
import { applyBrand } from "@/lib/brand";
import { useT } from "@/lib/i18n";

const MiniMap = dynamic(() => import("@/components/MiniMap"), { ssr: false, loading: () => <div className="h-56 animate-pulse rounded-2xl bg-surface2" /> });
type Track = { company: string; brand_color: string; logo_text: string; reference: string; status: string; terminal: boolean; steps: { key: string; at: string | null }[]; delivery_address: string; courier_first_name: string | null; courier_location: { lat: number; lon: number; age_seconds: number } | null; updated_at: string };

/** Public tracking page: no account, no sidebar. Shows only this customer's own order. */
export default function TrackPage() {
  const { token } = useParams<{ token: string }>();
  const { t, lang, setLang } = useT();
  useEffect(() => { try { if (!localStorage.getItem("lang")) setLang("ka", false); } catch {} }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  const { data, error, isLoading } = useQuery({ queryKey: ["track", token], queryFn: () => api<Track>(`/public/track/${token}`), refetchInterval: 10000, retry: false });
  useEffect(() => { applyBrand(data?.brand_color); }, [data?.brand_color]);
  const label = (k: string) => ({ ready: t("tl_placed"), assigned: t("tl_assigned"), picked_up: t("tl_picked"), on_the_way: t("tl_way"), delivered: t("tl_delivered") } as Record<string, string>)[k] ?? k;
  const idx = data ? ["ready", "assigned", "picked_up", "on_the_way", "delivered"].indexOf(data.status === "new" ? "ready" : data.status) : -1;
  return (
    <main className="mx-auto min-h-screen max-w-md space-y-4 bg-app p-5">
      <header className="flex items-center justify-between"><span className="flex items-center gap-2 text-lg font-semibold"><span className="flex h-9 min-w-9 items-center justify-center rounded-xl bg-brand px-1 font-bold text-brand-on">{data?.logo_text ?? "Z"}</span>{data?.company ?? ""}</span>
        <span className="flex items-center gap-2"><ThemeToggle /><button className="h-9 rounded-xl border px-2.5 text-xs" onClick={() => setLang(lang === "en" ? "ka" : "en")}>{lang === "en" ? "ქართ" : "EN"}</button></span></header>
      {isLoading && <p className="text-sm text-muted">{t("loading")}</p>}
      {error && <div role="alert" className="rounded-2xl border p-6 text-center text-sm">{t("pub_invalid")}</div>}
      {data && (
        <>
          <section className="rounded-2xl border bg-surface p-5">
            <p className="text-xs text-muted">{data.reference}</p>
            <h1 className="mt-1 text-2xl font-bold">{t(`st_${data.status}` as Parameters<typeof t>[0])}</h1>
            <p className="mt-2 text-sm text-muted">{t("pub_address")}: <span className="text-ink">{data.delivery_address}</span></p>
            {data.courier_first_name && <p className="text-sm text-muted">{t("pub_courier")}: <span className="text-ink">{data.courier_first_name}</span></p>}
          </section>
          {data.courier_location && <section><h2 className="mb-2 text-sm font-semibold">{t("pub_live")}</h2><MiniMap lat={data.courier_location.lat} lon={data.courier_location.lon} /></section>}
          <ol className="space-y-5 rounded-2xl border bg-surface p-5">
            {data.steps.map((s, i) => (
              <li key={s.key} className={`flex items-start gap-3 text-sm ${i <= idx || s.at ? "" : "text-muted"}`}>
                <span className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 ${i < idx || (i === idx && data.terminal) ? "border-ink bg-ink" : i === idx ? "border-brand bg-brand ring-4 ring-brand/20" : "border-line"}`} />
                <span><span className="block font-semibold">{label(s.key)}</span>{s.at && <span className="block text-xs text-muted">{new Date(s.at).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</span>}</span>
              </li>))}
          </ol>
          <p className="text-center text-xs text-muted">{t("pub_updated")}: {new Date(data.updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
        </>)}
    </main>
  );
}
