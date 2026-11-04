"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import AddressField from "@/components/AddressField";
import AppShell from "@/components/AppShell";
import { Button, ErrorText, Field, inputCls } from "@/components/ui";
import { can, useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { ageText, Branch, Courier, FRESH_COLOR, MODEL_LABEL } from "@/lib/types";

const OrderMap = dynamic(() => import("@/components/OrderMap"), { ssr: false, loading: () => <div className="h-full animate-pulse rounded-xl bg-line" /> });

type Place = { text: string; name: string; lat: number | null; lon: number | null; phone?: string };
const blank: Place = { text: "", name: "", lat: null, lon: null };
const pt = (p: Place) => (p.lat != null && p.lon != null ? { lat: p.lat, lon: p.lon } : null);

function NewOrder() {
  const { call, me } = useAuth();
  const { t } = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const [from, setFrom] = useState<Place>(blank);
  const [to, setTo] = useState<Place>(blank);
  const [active, setActive] = useState<"from" | "to">("from");
  const [customer, setCustomer] = useState(""); const [phone, setPhone] = useState("+995 ");
  const [details, setDetails] = useState(""); const [weight, setWeight] = useState("0"); const [priority, setPriority] = useState(0);
  const [tab, setTab] = useState<"inhouse" | "external">("inhouse");
  const [carsOnly, setCarsOnly] = useState(false);
  const [courierId, setCourierId] = useState<number | null>(null);
  const [clientKey] = useState(() => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())).replace(/-/g, "").slice(0, 24));

  // "Get The Pin": ?pin=<id> pre-fills the delivery point with the customer's own pin
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("pin");
    if (!id) return;
    call<{ lat: number | null; lon: number | null }>(`/pins/${id}`).then((p) => {
      if (p.lat != null && p.lon != null) { setTo((x) => ({ ...x, lat: p.lat, lon: p.lon, text: x.text || `${t("pin_dropped")} ${p.lat!.toFixed(5)}, ${p.lon!.toFixed(5)}` })); setActive("to"); }
    }).catch(() => {});
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  const branches = useQuery({ queryKey: ["branches"], queryFn: () => call<Branch[]>("/branches") });
  const [branchId, setBranchId] = useState<number | null>(null);
  const couriers = useQuery({ queryKey: ["couriers"], queryFn: () => call<Courier[]>("/fleet/couriers") });
  const kg = Number(weight) || 0;
  const list = useMemo(() => (couriers.data ?? []).filter((c) => !carsOnly || c.vehicle_type === "car"), [couriers.data, carsOnly]);
  const tooHeavy = (c: Courier) => c.capacity_kg != null && c.capacity_kg > 0 && kg > c.capacity_kg;

  const create = useMutation({
    mutationFn: (cid: number | null) => call("/orders", {
      method: "POST",
      body: JSON.stringify({
        client_key: clientKey, branch_id: branchId, pickup_address: from.text, pickup_branch: from.name, pickup_lat: from.lat, pickup_lon: from.lon,
        delivery_address: to.text, delivery_lat: to.lat, delivery_lon: to.lon, delivery_details: details,
        customer_name: customer, customer_phone: phone.trim() === "+995" ? "" : phone, weight_kg: kg, priority, courier_id: cid,
      }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders"] }); router.push("/"); },
  });
  const canSubmit = from.text.trim() && to.text.trim() && !create.isPending && (courierId == null || !tooHeavy(list.find((c) => c.id === courierId) ?? ({} as Courier)));

  const pick = (lat: number, lon: number) => {
    const set = active === "from" ? setFrom : setTo;
    set((p) => ({ ...p, lat, lon, text: p.text || `${t("pin_dropped")} ${lat.toFixed(5)}, ${lon.toFixed(5)}` }));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 pb-5 lg:flex-row">
      <section className="flex w-full flex-col gap-5 lg:w-[520px] lg:shrink-0 lg:overflow-y-auto lg:pr-1">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-extrabold uppercase tracking-wide">{t("place_order_h")}</h1>
          <div className="flex items-center gap-2">
            <button disabled title={t("import_soon")} className="flex h-10 cursor-not-allowed items-center gap-2 rounded-full border px-4 text-sm text-muted opacity-70">{t("upload_sheet")}</button>
            <button aria-label={t("close")} onClick={() => router.push("/")} className="flex h-10 w-10 items-center justify-center rounded-full border text-muted hover:bg-surface2">✕</button>
          </div>
        </div>

        {(branches.data?.length ?? 0) > 0 && (
          <Field label={t("branch")}>
            <select className={inputCls} aria-label={t("branch")} value={branchId ?? ""} onChange={(e) => {
              const b = branches.data!.find((x) => x.id === Number(e.target.value)); setBranchId(b?.id ?? null);
              if (b) setFrom({ text: b.address || b.name, name: b.name, lat: b.lat, lon: b.lon });
            }}><option value="">{t("pick_branch")}</option>{branches.data!.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </Field>)}
        <div className="grid gap-2 rounded-2xl border bg-surface p-2 sm:grid-cols-2">
          <AddressField label={t("where_from")} icon="○" value={from.text} active={active === "from"} onFocus={() => setActive("from")}
            onText={(v) => setFrom({ ...from, text: v })} onSelect={(a) => setFrom({ text: a.address, name: a.name, lat: a.lat, lon: a.lon, phone: a.phone })} />
          <AddressField align="right" label={t("where_to")} icon="◉" value={to.text} active={active === "to"} onFocus={() => setActive("to")}
            onText={(v) => setTo({ ...to, text: v })}
            onSelect={(a) => { setTo({ text: a.address, name: a.name, lat: a.lat, lon: a.lon, phone: a.phone }); if (!customer) setCustomer(a.name); if (a.phone && phone.trim() === "+995") setPhone(a.phone); if (a.details && !details) setDetails(a.details); }} />
        </div>
        <p className="-mt-3 text-xs text-muted">{t("pick_on_map")}</p>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("customer")}><input className={inputCls} value={customer} onChange={(e) => setCustomer(e.target.value)} /></Field>
          <Field label={t("phone")}><input className={inputCls} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <div className="col-span-2"><Field label={t("details")}><input className={inputCls} value={details} onChange={(e) => setDetails(e.target.value)} /></Field></div>
          <Field label={t("weight")}><input className={inputCls} type="number" min={0} step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} /></Field>
          <Field label={t("priority")}>
            <select className={inputCls} value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
              <option value={0}>{t("prio_normal")}</option><option value={1}>{t("prio_high")}</option><option value={2}>{t("prio_urgent")}</option></select>
          </Field>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold uppercase tracking-wide">{t("assign_couriers_h")}</h2>
            <button type="button" className="text-sm text-muted underline" onClick={() => create.mutate(null)} disabled={!from.text.trim() || !to.text.trim() || create.isPending}>{t("choose_later")}</button>
          </div>
          <div className="overflow-hidden rounded-2xl border bg-surface">
            <div className="flex items-center justify-between border-b bg-surface2 px-3 py-2 text-sm">
              <div className="flex gap-1">
                {(["external", "inhouse"] as const).map((k) => (
                  <button key={k} onClick={() => setTab(k)} className={`rounded-full px-3 py-1 ${tab === k ? "bg-brand font-semibold text-brand-on" : "text-muted hover:bg-line"}`}>{t(k === "inhouse" ? "in_house" : "external")}</button>
                ))}
              </div>
              {tab === "inhouse" && <label className="flex items-center gap-2 text-xs text-muted">{t("need_car")}
                <button type="button" role="switch" aria-checked={carsOnly} aria-label={t("need_car")} onClick={() => setCarsOnly(!carsOnly)} className={`h-6 w-10 rounded-full p-0.5 transition ${carsOnly ? "bg-solo" : "bg-line"}`}><i className={`block h-5 w-5 rounded-full bg-white transition ${carsOnly ? "translate-x-4" : ""}`} /></button></label>}
            </div>
            {tab === "external" ? (
              <div className="space-y-1 p-3">
                {["Wolt", "Glovo"].map((n) => (
                  <div key={n} className="flex items-center justify-between rounded-lg px-2 py-2 opacity-70">
                    <span className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface2 text-xs font-bold">{n[0]}</span>{n}</span>
                    <span className="rounded-full bg-surface2 px-2 py-0.5 text-xs text-muted">{t("not_connected")}</span>
                  </div>))}
                <p className="px-2 pt-2 text-xs text-muted">{t("providers_note")}</p>
              </div>
            ) : (
              <ul className="max-h-72 divide-y overflow-y-auto" role="radiogroup">
                {list.map((c) => {
                  const heavy = tooHeavy(c);
                  return (
                    <li key={c.id}>
                      <button type="button" role="radio" aria-checked={courierId === c.id} disabled={heavy} onClick={() => setCourierId(courierId === c.id ? null : c.id)}
                        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-surface2 disabled:cursor-not-allowed disabled:opacity-50 ${courierId === c.id ? "bg-brand-light" : ""}`}>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center text-xs font-bold text-white" style={{ background: FRESH_COLOR[c.freshness], borderRadius: c.vehicle_type === "scooter" ? "50%" : 6 }}>{MODEL_LABEL[c.vehicle_model ?? ""]?.letter ?? "?"}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{c.full_name}</span>
                          <span className="block truncate text-xs text-muted">{MODEL_LABEL[c.vehicle_model ?? ""]?.name} · {c.zone || "—"}{c.capacity_kg ? ` · ${c.capacity_kg} kg` : ""}</span>
                          {heavy && <span className="block text-xs text-red-600">{t("too_heavy", { n: c.capacity_kg ?? 0 })}</span>}
                        </span>
                        <span className="text-right text-xs text-muted">{c.freshness === "realtime" ? t("realtime") : <span className="text-amber-600">{c.freshness === "unknown" ? t("never") : `${t("gps_stale")} · ${ageText(c.age_seconds)}`}</span>}</span>
                        <span className={`h-4 w-4 shrink-0 rounded-full border-2 ${courierId === c.id ? "border-brand bg-brand" : "border-line"}`} aria-hidden />
                      </button>
                    </li>);
                })}
                {couriers.isLoading && <li className="p-3 text-sm text-muted">{t("loading")}</li>}
              </ul>
            )}
          </div>
        </div>

        <ErrorText error={create.error} />
        <Button className="h-12 w-full" disabled={!canSubmit} onClick={() => create.mutate(courierId)}>{t("continue_btn")}</Button>
      </section>
      <section className="min-h-[360px] flex-1 overflow-hidden rounded-2xl border"><OrderMap from={pt(from)} to={pt(to)} onPick={pick} /></section>
    </div>
  );
}

export default function Page() {
  const { me } = useAuth();
  const { t } = useT();
  return <AppShell fullHeight>{can.createOrder(me?.role) ? <NewOrder /> : null}</AppShell>;
}
