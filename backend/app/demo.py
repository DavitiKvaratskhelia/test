"""DEMO_MODE bootstrap: ephemeral SQLite + SIMULATED data. Runs lazily on first request (serverless-safe:
does not rely on ASGI startup events). Never used in production."""
import threading

from .config import settings

_lock = threading.Lock()
_done = False
status: dict = {"bootstrapped": False}


def ensure_bootstrap() -> None:
    global _done
    if _done or not settings.demo_mode:
        return
    with _lock:
        if _done:
            return
        from .create_user import create_user
        from .db import Base, SessionLocal, engine
        from .models import Courier, Order, User
        from .seed import seed
        from .seed_demo import seed_demo

        Base.metadata.create_all(engine)
        with SessionLocal() as db:
            seed(db)
            if settings.demo_user_email and settings.demo_user_password:
                create_user(db, settings.demo_user_email, settings.demo_user_password, "admin", "Demo admin")
            seed_demo(db)
            status.update(bootstrapped=True, users=db.query(User).count(), couriers=db.query(Courier).count(),
                          orders=db.query(Order).count())
        _done = True
