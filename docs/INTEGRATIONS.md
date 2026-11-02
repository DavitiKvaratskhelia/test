# Integrations: verified vs assumed

Nothing below has been tested against a live external service. No credentials are present in this repository.

| Integration | Status | Notes |
|---|---|---|
| GPS hardware vendor | **Unknown vendor** | Adapter interface only (`GpsProviderAdapter`). Needs: vendor name, API docs, credentials. |
| Mobile GPS (scooters) | Planned (Phase 2) | Ingest endpoint exists and is tested. RN app not yet built. |
| Google Routes / HERE / TomTom | **Not integrated** | Need API key + billing; must confirm per-provider two-wheeler profile support (HERE: scooter transport mode documented; Google: TWO_WHEELER mode availability is region-limited — verify for Georgia; TomTom: motorcycle/scooter limited). Treat as unverified. |
| Tomorrow.io / OpenWeather / Open-Meteo | **Not integrated** | Open-Meteo needs no key (non-commercial licence — confirm commercial terms). |
| Wolt Drive | **Not integrated** | Requires merchant onboarding + API credentials from Wolt. Mock adapter will be clearly flagged `simulated`. |
| Glovo | **Unverified** | Must confirm with Glovo whether an on-demand delivery API is offered to Zoommer. Do not implement until documented/authorized. |
| Zoommer e-commerce / ERP | **Unknown** | Generic `POST /orders/sync` + webhook contract provided. |

## Open business questions
Branch/warehouse list and pickup coordinates; courier contract types and base pay formula; working-hours law constraints; vehicle capacity data; SLA/late penalty values; Wolt/Glovo contract pricing; Georgian address geocoding source; data-retention periods and legal basis for GPS tracking (Georgian Personal Data Protection law); who approves weather bonuses.
