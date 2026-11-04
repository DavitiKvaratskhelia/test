"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, ErrorText } from "@/components/ui";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

const AddressPicker = dynamic(() => import("@/components/AddressPicker"), { ssr: false, loading: () => <div className="h-[55vh] animate-pulse rounded-2xl bg-surface2" /> });

/** "Get The Pin" page the customer opens on their phone: tap the map, confirm. Can be repeated until the link expires. */
export default function PinPage() {
  const { token } = useParams<{ token: string }>();
  const { t, lang, setLang } = useT();
  useEffect(() => { try { if (!localStorage.getItem("lang")) setLang("ka", false); } catch {} }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  const [pt, setPt] = useState<{ lat: number; lon: number } | null>(null);
  const [sent, setSent] = useState(false);
  const info = useQuery({ queryKey: ["pin", token], queryFn: () => api<{ company: string; submitted: boolean; lat: number | null; lon: number | null }>(`/public/pin/${token}`), retry: false });
  useEffect(() => { if (info.data?.lat != null && info.data.lon != null && !pt) setPt({ lat: info.data.lat, lon: info.data.lon }); }, [info.data]);  // eslint-disable-line react-hooks/exhaustive-deps
  const send = useMutation({ mutationFn: () => api(`/public/pin/${token}`, undefined, { method: "POST", body: JSON.stringify(pt) }), onSuccess: () => setSent(true) });
  return (
    <main className="mx-auto min-h-screen max-w-lg space-y-4 bg-app p-5">
      <header className="flex items-center justify-between"><span className="flex items-center gap-2 text-lg font-semibold"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand font-bold text-brand-on">Z</span>{info.data?.company ?? "Zoommer"}</span>
        <button className="h-9 rounded-xl border px-2.5 text-xs" onClick={() => setLang(lang === "en" ? "ka" : "en")}>{lang === "en" ? "ქართ" : "EN"}</button></header>
      {info.error ? <div role="alert" className="rounded-2xl border p-6 text-center text-sm">{t("pub_invalid")}</div> : (
        <>
          <h1 className="text-2xl font-bold">{t("pin_page_title")}</h1>
          <p className="text-sm text-muted">{t("pin_page_hint")}</p>
          <div className="h-[55vh] overflow-hidden rounded-2xl border"><AddressPicker value={pt} onPick={(lat, lon) => { setPt({ lat, lon }); setSent(false); }} /></div>
          <ErrorText error={send.error} />
          {sent && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{t("pin_thanks")} {t("pin_change")}</p>}
          <Button className="h-12 w-full" disabled={!pt || send.isPending} onClick={() => send.mutate()}>{t("pin_confirm")}</Button>
        </>)}
    </main>
  );
}
