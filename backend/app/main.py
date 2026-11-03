import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .config import assert_prod_safe, settings
from .db import engine
from .modules.auth.router import router as auth_router
from .modules.fleet.router import router as fleet_router
from .modules.orders.router import router as orders_router
from .modules.addresses.router import router as addresses_router
from .modules.zones.router import router as zones_router
from .modules.users.router import router as users_router
from .modules.settings.router import router as settings_router

logging.basicConfig(level=logging.INFO,
                    format='{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}')
assert_prod_safe()

app = FastAPI(title="Zoommer Smart Logistics API", version="0.1.0")
assert not (settings.demo_mode and settings.environment == "prod"), "DEMO_MODE must not run in prod"
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_origin_regex=settings.cors_origin_regex, allow_methods=["*"], allow_headers=["*"])
app.include_router(auth_router)
app.include_router(fleet_router)
app.include_router(orders_router)
app.include_router(addresses_router)
app.include_router(zones_router)
app.include_router(users_router)
app.include_router(settings_router)


@app.get("/health", tags=["ops"])
def health():
    from .demo import ensure_bootstrap, status as demo_status
    extra = {}
    if settings.demo_mode:
        try:
            ensure_bootstrap()
        except Exception as e:  # surface bootstrap failures instead of hiding them
            return {"status": "degraded", "demo": True, "bootstrap_error": f"{type(e).__name__}: {e}"}
        extra = {"demo": True, "simulated_data": True, **demo_status}
    try:
        with engine.connect() as c:
            c.execute(text("select 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "ok" if db_ok else "degraded", "db": db_ok, "env": settings.environment, **extra}

