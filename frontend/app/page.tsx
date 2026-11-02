"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "./api";

type Courier = {
  id: number; full_name: string; status: string; zone: string; freshness: "realtime" | "delayed" | "offline" | "unknown";
  age_seconds: number | null; last_location: { lat: number; lon: number } | null;
};

const badge: Record<Courier["freshness"], string> = {
  realtime: "bg-green-100 text-green-800", delayed: "bg-amber-100 text-amber-800",
  offline: "bg-red-100 text-red-800", unknown: "bg-neutral-200 text-neutral-700",
};

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

export default function Home() {
  const [token, setToken] = useState<string>();
  const { data, error } = useQuery({ queryKey: ["couriers", token], enabled: !!token, queryFn: () => api<Courier[]>("/fleet/couriers", token) });
  if (!token) return <Login onToken={setToken} />;
  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Fleet <span className="text-brand">status</span></h1>
      {error && <p className="text-red-600">{String(error)}</p>}
      <table className="w-full rounded-lg bg-white text-left shadow">
        <thead className="border-b text-sm text-neutral-500"><tr><th className="p-3">Courier</th><th>Zone</th><th>GPS</th><th>Age</th></tr></thead>
        <tbody>{data?.map((c) => (
          <tr key={c.id} className="border-b last:border-0">
            <td className="p-3">{c.full_name}</td><td>{c.zone || "—"}</td>
            <td><span className={`rounded px-2 py-0.5 text-xs ${badge[c.freshness]}`}>{c.freshness}</span></td>
            <td>{c.age_seconds == null ? "never" : `${Math.round(c.age_seconds)}s`}</td>
          </tr>))}</tbody>
      </table>
      <p className="mt-3 text-xs text-neutral-500">Map view, orders and routing arrive in later phases.</p>
    </main>
  );
}
