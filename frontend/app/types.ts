export type Freshness = "realtime" | "delayed" | "offline" | "unknown";

export type Courier = {
  id: number; full_name: string; status: string; zone: string; branch: string;
  vehicle_type: "car" | "scooter" | null; vehicle_model: string | null; plate: string | null;
  is_simulated: boolean; freshness: Freshness; age_seconds: number | null;
  last_location: { lat: number; lon: number } | null; source: string | null;
};

export type OrderPoint = {
  id: number; external_id: string; status: string; delivery_address: string; zone: string;
  delivery_lat: number | null; delivery_lon: number | null; weight_kg: number; is_simulated: boolean; priority: number;
};

export const MODEL_LABEL: Record<string, { letter: string; name: string }> = {
  marshrutka: { letter: "M", name: "Marshrutka" }, combo: { letter: "C", name: "Combo" },
  prius_v: { letter: "P", name: "Prius V" }, scooter: { letter: "S", name: "Scooter" },
};

export const FRESH_COLOR: Record<Freshness, string> = {
  realtime: "#16a34a", delayed: "#d97706", offline: "#9ca3af", unknown: "#d1d5db",
};

export function ageText(s: number | null): string {
  if (s == null) return "never reported";
  if (s < 90) return `${Math.round(s)}s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  return `${(s / 3600).toFixed(1)} h ago`;
}
