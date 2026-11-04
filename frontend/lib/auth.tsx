"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError } from "./api";
import type { Me } from "./types";

type Auth = {
  token?: string; me?: Me; ready: boolean;
  login: (email: string, password: string) => Promise<void>; logout: () => void;
  call: <T>(path: string, init?: RequestInit) => Promise<T>;
};
const Ctx = createContext<Auth>(null as unknown as Auth);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string>();
  const [me, setMe] = useState<Me>();
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    setToken(undefined); setMe(undefined);
    try { sessionStorage.removeItem("tok"); } catch {}
  }, []);

  const load = useCallback(async (t: string) => {
    try { setMe(await api<Me>("/auth/me", t)); setToken(t); try { sessionStorage.setItem("tok", t); } catch {} }
    catch { logout(); }
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
    await load(r.access_token);
  };

  // calls with the current token; an expired/invalid token signs the user out
  const call = useCallback(async <T,>(path: string, init?: RequestInit) => {
    try { return await api<T>(path, token, init); }
    catch (e) { if (e instanceof ApiError && e.status === 401) logout(); throw e; }
  }, [token, logout]);

  return <Ctx.Provider value={{ token, me, ready, login, logout, call }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);

export const can = {
  manageZones: (r?: string) => r === "admin" || r === "operations_manager",
  manageSettings: (r?: string) => r === "admin" || r === "operations_manager",
  manageUsers: (r?: string) => r === "admin",
  addresses: (r?: string) => r === "admin" || r === "dispatcher" || r === "operations_manager",
  createOrder: (r?: string) => r === "admin" || r === "dispatcher" || r === "operations_manager",
  fleet: (r?: string) => r === "admin" || r === "dispatcher" || r === "operations_manager",
};
