# Stage plan vs. the Logistics-SaaS prompt

Status legend: **Done** = built and exercised through the normal user path (backend tests + browser run). **Partial** = some of it. **Not built** = nothing yet.
Everything runs on SIMULATED demo data; no external integration has been tested with real credentials (see INTEGRATIONS.md).

## §2 SaaS foundation
| Item | Status | Notes |
|---|---|---|
| Tenant / company isolation, branches, per-tenant roles, platform admin | **Not built** | Currently one company. This is the next stage and touches every table and query, so it should come before more features. |
| Roles (admin, dispatcher, ops manager, finance, courier, api service) | Partial | Role matrix enforced server-side; not yet per-tenant. Owner/Analyst roles missing. |
| Plan limits / usage metering | Not built | |
| Georgian + English, GEL, Asia/Tbilisi | Partial | EN/KA UI. Amounts are decimals, not integer tetri yet. Timezone setting is stored, display uses the browser zone. |
| Account → Profile (company name/email/phone, admin name, password) | **Done** | Password change needs the current password. Logo upload not built. |
| Account → Billing / Transactions / Payment methods | Not built | Pages say so; nothing simulated. |
| Saved addresses (search, map pin, entrance/floor, phone, pagination) | **Done** | No geocoder yet (type address + drop pin). Archive-instead-of-delete not built. |
| Service zones (draw polygon, assign couriers, layers) | Partial | No vertex dragging / self-intersection check / overlap priority yet. |
| Regional settings, Team, Terms, Integration pages | Partial | Team + regional values exist; Terms are empty states; Integration lists connectors as "Not connected". |

## §3 Dispatcher workspace
| Item | Status | Notes |
|---|---|---|
| Active orders (dispatched / pending tabs, courier rail, search, date, area, sort, map) | **Done** | Server-side pagination not yet (client side, 500 orders max). |
| Create order (from/to with saved addresses, pin on map, courier choice or "choose later", capacity check, idempotent) | **Done** | Plus Codes, slots, parcel dimensions, internal/courier notes: not built. |
| Get The Pin (24 h link, customer drops pin, result usable in a new order) | **Done** | Rate limiting on public endpoints not built. |
| Order details (timeline with real times, assign/change courier, change status with reason, comment, tracking link) | **Done** | SMS is an `sms:` link, not a gateway. |
| Order history (status pills with counts, filters, sorting, CSV export) | **Done** | Review column omitted (no feature behind it). |
| Import CSV/XLSX | Not built | Button is present but disabled. |

## §4 Lifecycle
Done: new → ready → assigned → picked up → on the way → delivered, plus failed (reason required), returned, cancelled; every change writes an event row; stale `expected_version` returns 409; two dispatchers assigning at once leave exactly one active courier (tested on PostgreSQL).
Not built: proof of delivery (photo/signature/OTP), pickup code/scan, handover record after pickup, delivery attempts table.

## §5 Dispatching / routing — Not built
Auto-assignment, offers, route planning, traffic matrix, the numeric A/B test. Distance shown is straight-line and labelled so; price uses the tariff in Payment parameters.

## §6 Fleet, mobile app, GPS
Done: courier add/edit with 6 transport kinds and capacity, GPS ingest with validation/dedupe/consent/freshness, live map with stale positions marked.
Not built: mobile app, device-GPS vendor adapter, offline queue, shifts UI.

## §7 Weather and pay — Not built
## §8 Partners and ERP — Not built (adapters would start as mocks flagged "simulated")
## §9 Customer experience
Done: public tracking page (own order only, courier position only while on the way and only if fresh; expires, revocable).
Not built: SMS sending, analytics heat maps, KPI dictionary.

## §10 Operations
Done: migrations 0001–0005 (round-trip tested), seed data, tests. Not built: second-company seed, load test (100 couriers / 100k orders), backup-restore drill, monitoring.

## Next stage (recommended order)
1. Multi-tenancy + branches + per-tenant roles, with cross-tenant access tests (everything else depends on it).
2. Server-side pagination, import, delivery attempts, proof of delivery.
3. Courier mobile app (shift, tasks, pickup/deliver, GPS, offline queue).
4. Routing recommendations (insertion heuristic + the §5 numeric test), then offers/auto-assign.
5. Pay schemes, weather evidence, partners.
