# Zoommer Smart Logistics Platform — Architecture

Status: Phase 1 (foundation). See `ROADMAP.md` for phase status and `INTEGRATIONS.md` for what is verified vs assumed.

## Style
Modular monolith. One FastAPI deployable, one PostgreSQL/PostGIS database, Redis for cache/queues/pub-sub.
Modules own their tables and expose service functions; other modules call services, never each other's tables
(enforced by convention + review; extraction to services later means swapping function calls for HTTP/queue calls).

```
backend/app/
  core: config, db, security (JWT, RBAC), audit
  models/         SQLAlchemy models (single metadata, grouped by module)
  modules/
    auth/         login, token, current user
    fleet/        couriers, vehicles, GPS ingest, freshness        (Module A)
    orders/       order CRUD, idempotent sync, status transitions  (Module H)
    traffic/      TrafficProvider adapters + matrix cache          (Module B)  [Phase 3]
    routing/      OR-Tools VRPTW/DVRP, objective weights           (Module C)  [Phase 3]
    weather/      WeatherProvider adapters, classification         (Module D)  [Phase 4]
    compensation/ rules engine + ledger                            (Module E)  [Phase 4]
    providers/    Wolt/Glovo/mock adapters, selection              (F, G)      [Phase 5]
    analytics/    cost + performance, CSV/XLSX export              (Module K)  [Phase 5-6]
  workers/        Celery tasks (optimization, polling, retention) [Phase 3+]
frontend/         Next.js dispatch dashboard (EN/KA)
mobile/           React Native courier app                       [Phase 2]
```

## Key design decisions
1. **Honest data provenance.** Every location, weather record, provider quote and cost carries `source` and an `is_simulated` flag where relevant. Simulated data is never mixed silently with live data.
2. **Stale GPS is never "current".** `services/freshness.py` classifies each courier as `realtime | delayed | offline | unknown` from `last_seen`; thresholds are configurable (`GPS_REALTIME_MAX_AGE_S`, `GPS_DELAYED_MAX_AGE_S`). API responses always include `age_seconds` and `freshness`.
3. **Idempotency everywhere inbound.** Orders are unique on `(source_system, external_id)`; location events unique on `(courier_id, recorded_at, source)`. Replays return the original record.
4. **Auditable money.** Compensation ledger rows are append-only; corrections are new rows referencing the original, carrying rule version + weather evidence snapshot id.
5. **Missing evidence ≠ no rain.** Weather bonus has an explicit, configured fallback policy (`deny | allow_forecast | manual_review`).
6. **Spatial.** Coordinates are stored as plain `lat/lon` (portable, testable) plus PostGIS `geography(Point,4326)` columns + GiST indexes created by the Postgres migration. Spatial queries (geofence, nearest courier) use PostGIS in production.
7. **Event-driven re-optimization (Phase 3).** Triggers: new order, courier delay > threshold, traffic delta > threshold, manual request. Throttled per-zone, results cached by matrix key; solver has hard time limit and falls back to last feasible plan / haversine estimates.
8. **Security.** JWT access tokens, scrypt password hashes, RBAC permission map (`core/security.py`), audit log on state-changing endpoints, service accounts for ERP, integration credentials stored encrypted (Fernet, key from env/secret manager).

## RBAC
| Role | Summary |
|---|---|
| admin | everything |
| dispatcher | orders, dispatch, fleet view, routes |
| operations_manager | dispatcher + analytics + courier mgmt |
| finance_manager | compensation, analytics, exports |
| courier | own shift, own assignments, post own GPS |
| api_service | order sync only |

## Data flow (target)
GPS device/phone → `POST /fleet/locations` (validated, deduped) → `courier.last_seen/last_location` + `location_events` → Redis pub/sub → WebSocket → live map.
ERP → `POST /orders/sync` (idempotent) → geocode → eligibility → provider selection → dispatch → route optimization → courier app.

## ERD
See `ERD.md` (Mermaid, generated from the model set).
