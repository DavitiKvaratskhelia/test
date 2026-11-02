# ERD (Mermaid)

```mermaid
erDiagram
  roles ||--o{ users : has
  users ||--o| couriers : "is"
  couriers ||--o{ shifts : works
  vehicles ||--o{ shifts : used_in
  couriers ||--o{ location_events : emits
  vehicles ||--o{ location_events : emits
  gps_providers ||--o{ gps_devices : owns
  vehicles ||--o{ gps_devices : carries
  orders ||--o{ order_stops : has
  orders ||--o{ delivery_assignments : "assigned via"
  couriers ||--o{ delivery_assignments : takes
  delivery_providers ||--o{ delivery_assignments : takes
  route_optimization_jobs ||--o{ routes : produces
  couriers ||--o{ routes : drives
  routes ||--o{ route_stops : sequences
  order_stops ||--o{ route_stops : scheduled_as
  orders ||--o{ provider_quotes : quoted
  delivery_providers ||--o{ provider_quotes : gives
  orders ||--o{ provider_deliveries : fulfilled_by
  provider_quotes ||--o| provider_deliveries : accepted
  orders ||--o{ delivery_cost_records : costs
  couriers ||--o{ compensation_ledger : earns
  orders ||--o| compensation_ledger : for
  compensation_rules ||--o{ compensation_ledger : applied
  compensation_ledger ||--o{ compensation_ledger : adjusts
  users ||--o{ audit_logs : acts
```
Standalone: `weather_observations`, `weather_forecasts`, `integration_credentials`, `integration_events`.
Authoritative definitions: `backend/app/models/__init__.py` and Alembic migrations.
