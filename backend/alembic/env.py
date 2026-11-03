from alembic import context

from app.config import settings
from app.db import Base, engine
import app.models  # noqa: F401  (register tables)

target_metadata = Base.metadata


def include_object(obj, name, type_, reflected, compare_to):
    # PostGIS generated geography columns are managed by migration 0002, not by the ORM models
    if type_ == "column" and reflected and name.endswith("geog"):
        return False
    if type_ == "index" and reflected and name.endswith("_geog"):
        return False
    if type_ == "table" and name == "spatial_ref_sys":  # PostGIS system table
        return False
    return True


def run_migrations_online():
    with engine.connect() as conn:
        context.configure(connection=conn, target_metadata=target_metadata, compare_type=True, include_object=include_object)
        with context.begin_transaction():
            context.run_migrations()


def run_migrations_offline():
    context.configure(url=settings.database_url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
