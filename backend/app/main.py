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
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"])
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
