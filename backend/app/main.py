import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .config import assert_prod_safe, settings
from .db import engine
from .modules.auth.router import router as auth_router
from .modules.fleet.router import router as fleet_router
from .modules.orders.router import router as orders_router

logging.basicConfig(level=logging.INFO,
                    format='{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}')
assert_prod_safe()

app = FastAPI(title="Zoommer Smart Logistics API", version="0.1.0")
assert not (settings.demo_mode and settings.environment == "prod"), "DEMO_MODE must not run in prod"
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_origin_regex=settings.cors_origin_regex, allow_methods=["*"], allow_headers=["*"])
app.include_router(auth_router)
app.include_router(fleet_router)
app.include_router(orders_router)


@app.get("/health", tags=["ops"])
def health():
    try:
        with engine.connect() as c:
            c.execute(text("select 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "ok" if db_ok else "degraded", "db": db_ok, "env": settings.environment}


@app.on_event("startup")
def demo_bootstrap():
    """Only in DEMO_MODE: create schema, roles, optional demo login and SIMULATED fleet data."""
    if not settings.demo_mode:
        return
    from .db import Base, SessionLocal
    from .seed import seed
    from .seed_demo import seed_demo
    from .create_user import create_user

    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)
        if settings.demo_user_email and settings.demo_user_password:
            create_user(db, settings.demo_user_email, settings.demo_user_password, "admin", "Demo admin")
        seed_demo(db)
