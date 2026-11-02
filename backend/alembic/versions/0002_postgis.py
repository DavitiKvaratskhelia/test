"""PostGIS geography columns, GiST indexes (PostgreSQL only; no-op elsewhere)

Revision ID: 0002
Revises: 0001
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

# table, lat col, lon col, generated geography column
GEO = [
    ("location_events", "lat", "lon", "geog"),
    ("couriers", "last_lat", "last_lon", "last_geog"),
    ("orders", "delivery_lat", "delivery_lon", "delivery_geog"),
    ("orders", "pickup_lat", "pickup_lon", "pickup_geog"),
    ("order_stops", "lat", "lon", "geog"),
    ("weather_observations", "lat", "lon", "geog"),
]


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    for t, lat, lon, g in GEO:
        # generated from lat/lon so the two representations can never drift apart
        op.execute(f"ALTER TABLE {t} ADD COLUMN {g} geography(Point,4326) GENERATED ALWAYS AS "
                   f"(CASE WHEN {lat} IS NULL OR {lon} IS NULL THEN NULL "
                   f"ELSE ST_SetSRID(ST_MakePoint({lon},{lat}),4326)::geography END) STORED")
        op.execute(f"CREATE INDEX ix_{t}_{g} ON {t} USING GIST ({g})")


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    for t, _, _, g in GEO:
        op.execute(f"DROP INDEX IF EXISTS ix_{t}_{g}")
        op.execute(f"ALTER TABLE {t} DROP COLUMN IF EXISTS {g}")
