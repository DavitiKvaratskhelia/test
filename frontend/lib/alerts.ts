import type { Order } from "./types";

/** Orders that need a dispatcher's attention: failed deliveries and orders still without a courier. */
export const alertCount = (orders: Order[]) => orders.filter((o) => o.status === "failed" || o.status === "new" || o.status === "ready").length;
