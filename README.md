# Zoommer Smart Logistics & AI Delivery Platform

Modular monolith: FastAPI + PostgreSQL/PostGIS + Redis (backend), Next.js (dispatch dashboard). See `docs/`.

## Run
```
cp .env.example .env   # fill in secrets
docker compose up --build
# API http://localhost:8000/docs   UI http://localhost:3000
```
Without Docker: `cd backend && pip install -e ".[dev]" && alembic upgrade head && python -m app.seed && uvicorn app.main:app --reload`

## Tests
Demo data (simulated, flagged `is_simulated`): `python -m app.seed_demo` or `SEED_DEMO=1` in `.env` for Docker.

`cd backend && pytest` (SQLite). For the concurrency test and PostGIS-faithful behaviour:
`TEST_DATABASE_URL=postgresql+psycopg://user:pw@localhost/db pytest`

## Status: Phase 1 (see docs/ROADMAP.md)
Implemented and tested: schema for all required entities, migrations (+PostGIS), JWT auth, RBAC, audit log,
courier/vehicle management, GPS ingest (validation, dedupe, offline batch sync, consent gate, freshness classes),
idempotent order sync, status state machine, frontend login + fleet status table.

Not implemented yet: WebSocket/live map, GPS vendor adapters, mobile app, traffic/routing/OR-Tools, weather,
compensation, Wolt/Glovo, analytics, Georgian i18n, rate limiting, Celery workers, CI pipeline, credential
encryption helper. No external integration has been tested with real credentials.
The Dockerfiles and docker-compose.yml were written but NOT built or run here. The stack was verified by running
the backend against local PostgreSQL 16 + PostGIS 3 and by `next build`.
