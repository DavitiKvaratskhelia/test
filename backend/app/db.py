from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool

from .config import settings

_kwargs: dict = {}
if settings.database_url.startswith("sqlite"):
    _kwargs = {"connect_args": {"check_same_thread": False}}
    if ":memory:" in settings.database_url:
        _kwargs["poolclass"] = StaticPool

engine = create_engine(settings.database_url, pool_pre_ping=True, **_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    from .demo import ensure_bootstrap  # no-op unless DEMO_MODE
    ensure_bootstrap()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
