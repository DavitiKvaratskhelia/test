import type { Order } from "./types";

export type Alert = { key: string; tone: "red" | "amber"; ref: string; kind: "failed" | "unassigned" };

/** Orders that need a dispatcher's attention: failed deliveries and orders that are ready but have no courier. */
export function alertList(orders: Order[]): Alert[] {
  const out: Alert[] = [];
  for (const o of orders) {
    if (o.status === "failed") out.push({ key: `f${o.id}`, tone: "red", ref: o.external_id, kind: "failed" });
    else if (o.status === "ready" || o.status === "new") out.push({ key: `u${o.id}`, tone: "amber", ref: o.external_id, kind: "unassigned" });
  }
  return out.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "red" ? -1 : 1));
}
export const alertCount = (orders: Order[]) => alertList(orders).length;
