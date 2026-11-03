export type Freshness = "realtime" | "delayed" | "offline" | "unknown";

export type Courier = {
  id: number; full_name: string; status: string; zone: string; branch: string;
  vehicle_type: "car" | "scooter" | null; vehicle_model: string | null; plate: string | null;
  is_simulated: boolean; capacity_kg: number | null; capacity_volume_l: number | null; freshness: Freshness; age_seconds: number | null;
  last_location: { lat: number; lon: number } | null; source: string | null;
};

export type Order = {
  id: number; external_id: string; status: string; delivery_address: string; pickup_address: string;
  customer_name: string; customer_phone: string; zone: string; pickup_lat: number | null; pickup_lon: number | null; delivery_lat: number | null; delivery_lon: number | null;
  weight_kg: number; is_simulated: boolean; priority: number; window_end: string | null; courier_name: string | null; created_at: string | null;
};

export type Zone = { id: number; name: string; polygon: number[][]; color: string; active: boolean; courier_ids: number[] };
export type SavedAddress = { id: number; name: string; address: string; lat: number | null; lon: number | null; details: string; phone: string };
export type UserRow = { id: number; email: string; full_name: string; role: string; is_active: boolean; locale: string };
export type RoleInfo = { name: string; description: string };
export type Me = { id: number; email: string; role: string; locale: string };

export type AppSettings = {
  account: { company_name: string; default_locale: string; timezone: string };
  delivery: { default_service_time_s: number; max_active_orders_per_courier: number; late_threshold_min: number; auto_dispatch: boolean };
  payment: { currency: string; base_rate: number; per_km_rate: number };
  geolocation: { gps_interval_s: number; realtime_max_age_s: number; delayed_max_age_s: number; retention_days: number };
};

export const MODEL_LABEL: Record<string, { letter: string; name: string }> = {
  marshrutka: { letter: "M", name: "Marshrutka" }, combo: { letter: "C", name: "Combo" },
  prius_v: { letter: "P", name: "Prius V" }, scooter: { letter: "S", name: "Scooter" },
};

export const FRESH_COLOR: Record<Freshness, string> = {
  realtime: "#16a34a", delayed: "#d97706", offline: "#9ca3af", unknown: "#d1d5db",
};

export function ageText(s: number | null): string {
  if (s == null) return "—";
  if (s < 90) return `${Math.round(s)}s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  return `${(s / 3600).toFixed(1)} h`;
}
