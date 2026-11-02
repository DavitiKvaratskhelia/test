# Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Repo, schema (all 24 entities), migrations, auth+RBAC, audit, fleet+orders APIs, GPS freshness, Docker | **In progress — backend done, see below** |
| 2 | GPS adapter framework, WebSocket live feed, live map, React Native tracking + offline sync | Not started |
| 3 | Traffic adapters, OR-Tools VRPTW, dispatch UI | Not started |
| 4 | Weather adapters, classification, compensation rules + ledger | Not started |
| 5 | Wolt/Glovo adapters (mock until credentials), provider selection | Not started |
| 6 | Perf/security/E2E tests, monitoring, deployment docs | Not started |

## Phase 1 checklist
- [x] Architecture, integrations register, roadmap
- [x] SQLAlchemy models for all required entities
- [x] Alembic migration with PostGIS columns/indexes (Postgres only)
- [x] JWT auth, RBAC, audit log
- [x] Couriers/vehicles, GPS ingest (validation, dedupe, freshness), orders (idempotent sync)
- [x] pytest suite
- [x] Docker compose (postgis, redis, backend)
- [ ] Frontend foundation (see frontend/README)
