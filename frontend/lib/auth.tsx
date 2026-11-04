"use client";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError } from "./api";
import { applyBrand } from "./brand";
import type { Me } from "./types";

type Auth = {
  token?: string; me?: Me; ready: boolean;
  login: (email: string, password: string) => Promise<void>; logout: () => void;
  switchCompany: (tenantId: number) => Promise<void>; adoptToken: (token: string) => Promise<void>;
  call: <T>(path: string, init?: RequestInit) => Promise<T>;
};
const Ctx = createContext<Auth>(null as unknown as Auth);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [token, setToken] = useState<string>();
  const [me, setMe] = useState<Me>();
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    setToken(undefined); setMe(undefined); qc.clear(); applyBrand(null);
    try { sessionStorage.removeItem("tok"); } catch {}
  }, [qc]);

  const load = useCallback(async (t: string) => {
    try {
      const m = await api<Me>("/auth/me", t);
      setMe(m); setToken(t); applyBrand(m.tenant?.brand_color);
      try { sessionStorage.setItem("tok", t); } catch {}
    } catch { logout(); }
  }, [logout]);

  useEffect(() => {
    const h = () => { try { const t = sessionStorage.getItem("tok"); if (t) api<Me>("/auth/me", t).then(setMe).catch(() => {}); } catch {} };
    window.addEventListener("profile-changed", h);
    return () => window.removeEventListener("profile-changed", h);
  }, []);

  useEffect(() => {
    let t: string | null = null;
    try { t = sessionStorage.getItem("tok"); } catch {}
    (t ? load(t) : Promise.resolve()).finally(() => setReady(true));
  }, [load]);

  const login = async (email: string, password: string) => {
    const r = await api<{ access_token: string }>("/auth/login", undefined, { method: "POST", body: JSON.stringify({ email, password }) });
    qc.clear();
    await load(r.access_token);
  };

  // a new token for another company: every cached query belongs to the old company, so all of it is dropped
  const adoptToken = useCallback(async (t: string) => { qc.clear(); await load(t); }, [qc, load]);
  const switchCompany = useCallback(async (tenantId: number) => {
    const r = await api<{ access_token: string }>("/auth/switch", token, { method: "POST", body: JSON.stringify({ tenant_id: tenantId }) });
    await adoptToken(r.access_token);
  }, [token, adoptToken]);

  // calls with the current token; an expired/invalid token signs the user out
  const call = useCallback(async <T,>(path: string, init?: RequestInit) => {
    try { return await api<T>(path, token, init); }
    catch (e) { if (e instanceof ApiError && e.status === 401) logout(); throw e; }
  }, [token, logout]);

  return <Ctx.Provider value={{ token, me, ready, login, logout, switchCompany, adoptToken, call }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);

const R = (...roles: string[]) => (r?: string | null) => !!r && roles.includes(r);
export const can = {
  manageZones: R("owner", "admin", "operations_manager"),
  manageSettings: R("owner", "admin", "operations_manager"),
  manageUsers: R("owner", "admin"),
  manageBranches: R("owner", "admin", "operations_manager"),
  addresses: R("owner", "admin", "dispatcher", "operations_manager", "branch_operator"),
  createOrder: R("owner", "admin", "dispatcher", "operations_manager", "branch_operator"),
  dispatch: R("owner", "admin", "dispatcher", "branch_operator"),   // mirrors the server permission "dispatch"
  fleet: R("owner", "admin", "dispatcher", "operations_manager", "analyst", "branch_operator"),
};
