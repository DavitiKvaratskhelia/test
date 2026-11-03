"use client";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { ageText, Courier, FRESH_COLOR, Freshness, MODEL_LABEL, OrderPoint } from "./types";

const FleetMap = dynamic(() => import("@/components/FleetMap"), { ssr: false, loading: () => <div className="h-full animate-pulse rounded-lg bg-neutral-200" /> });

function Login({ onToken }: { onToken: (t: string) => void }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [err, setErr] = useState("");
  return (
    <form className="mx-auto mt-24 max-w-sm space-y-3 rounded-lg bg-white p-6 shadow" onSubmit={async (e) => {
      e.preventDefault();
      try { onToken((await api<{ access_token: string }>("/auth/login", undefined, { method: "POST", body: JSON.stringify({ email, password }) })).access_token); }
      catch { setErr("Invalid credentials"); }
    }}>
      <h1 className="text-xl font-semibold text-brand">Zoommer Dispatch</h1>
      <input className="w-full rounded border p-2" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="w-full rounded border p-2" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button className="w-full rounded bg-brand p-2 font-medium text-white hover:bg-brand-dark">Sign in</button>
    </form>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="block text-xs text-neutral-500">{label}
      <select className="mt-1 w-full rounded border bg-white p-1.5 text-sm text-neutral-900" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [vehicleType, setVehicleType] = useState(""); const [freshness, setFreshness] = useState(""); const [zone, setZone] = useState("");
  const [showOrders, setShowOrders] = useState(true); const [selected, setSelected] = useState<number | null>(null);
  const qs = new URLSearchParams(Object.entries({ vehicle_type: vehicleType, freshness, zone }).filter(([, v]) => v)).toString();
  const couriers = useQuery({ queryKey: ["couriers", qs], queryFn: () => api<Courier[]>(`/fleet/couriers${qs ? `?${qs}` : ""}`, token) });
  const orders = useQuery({ queryKey: ["orders"], queryFn: () => api<OrderPoint[]>("/orders", token).catch(() => [] as OrderPoint[]) });
  const all = useQuery({ queryKey: ["couriers-all"], queryFn: () => api<Courier[]>("/fleet/couriers", token) });
  const zones = useMemo(() => [...new Set((all.data ?? []).map((c) => c.zone).filter(Boolean))].sort(), [all.data]);
  const list = couriers.data ?? [];
  const counts = (["realtime", "delayed", "offline", "unknown"] as Freshness[]).map((f) => [f, list.filter((c) => c.freshness === f).length] as const);
  const openOrders = (orders.data ?? []).filter((o) => !["delivered", "cancelled", "returned"].includes(o.status));
  const simulated = list.some((c) => c.is_simulated);
  useEffect(() => { if (couriers.error && String(couriers.error).startsWith("Error: 401")) onLogout(); }, [couriers.error, onLogout]);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b bg-white px-4 py-2">
        <h1 className="text-lg font-semibold">Zoommer <span className="text-brand">Dispatch</span> · Live fleet</h1>
        <div className="flex items-center gap-3 text-xs">
          {simulated && <span className="rounded bg-brand-light px-2 py-1 font-semibold text-brand-dark">SIMULATED DEMO DATA</span>}
          <button className="text-neutral-500 underline" onClick={onLogout}>Sign out</button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="flex max-h-[45vh] w-full shrink-0 flex-col gap-3 overflow-y-auto border-r bg-white p-3 md:max-h-none md:w-80">
          <div className="grid grid-cols-3 gap-2">
            <Select label="Vehicle" value={vehicleType} onChange={setVehicleType} options={[["car", "Cars"], ["scooter", "Scooters"]]} />
            <Select label="GPS" value={freshness} onChange={setFreshness} options={[["realtime", "Realtime"], ["delayed", "Delayed"], ["offline", "Offline"], ["unknown", "No signal yet"]]} />
            <Select label="Zone" value={zone} onChange={setZone} options={zones.map((z) => [z, z])} />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showOrders} onChange={(e) => setShowOrders(e.target.checked)} />Show open orders ({openOrders.length})</label>
          <div className="flex flex-wrap gap-2 text-xs">
            {counts.map(([f, n]) => <span key={f} className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: FRESH_COLOR[f] }} />{f} {n}</span>)}
          </div>
          {couriers.error && <p className="text-sm text-red-600">{String(couriers.error)}</p>}
          <ul className="divide-y text-sm">
            {list.map((c) => (
              <li key={c.id}>
                <button disabled={!c.last_location} onClick={() => setSelected(c.id)}
                  className={`flex w-full items-center gap-2 py-2 text-left ${selected === c.id ? "bg-brand-light" : ""} disabled:opacity-60`}>
                  <span className="flex h-7 w-7 items-center justify-center text-xs font-bold text-white" style={{ background: FRESH_COLOR[c.freshness], borderRadius: c.vehicle_type === "scooter" ? "50%" : 6 }}>{MODEL_LABEL[c.vehicle_model ?? ""]?.letter ?? "?"}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate">{c.full_name}</span>
                    <span className="block truncate text-xs text-neutral-500">{MODEL_LABEL[c.vehicle_model ?? ""]?.name} · {c.zone} · {c.status}</span></span>
                  <span className="text-right text-xs text-neutral-500">{c.freshness}<br />{ageText(c.age_seconds)}</span>
                </button>
              </li>))}
          </ul>
        </aside>
        <main className="min-h-[300px] flex-1 p-3">
          <FleetMap couriers={list} orders={showOrders ? openOrders : []} selectedId={selected} onSelect={setSelected} />
        </main>
      </div>
    </div>
  );
}

export default function Home() {
  const [token, setToken] = useState<string>();
  useEffect(() => { try { const t = sessionStorage.getItem("tok"); if (t) setToken(t); } catch {} }, []);
  const set = (t?: string) => { setToken(t); try { t ? sessionStorage.setItem("tok", t) : sessionStorage.removeItem("tok"); } catch {} };
  return token ? <Dashboard token={token} onLogout={() => set(undefined)} /> : <Login onToken={set} />;
}
