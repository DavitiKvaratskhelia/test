"""order lifecycle (on_the_way, version, comment, distance, status events), public links, courier name parts, transport kinds

Revision ID: 0005
Revises: 0004
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

JSONType = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.add_column("orders", sa.Column("version", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("orders", sa.Column("comment", sa.Text(), nullable=False, server_default=""))
    op.add_column("orders", sa.Column("distance_m", sa.Float(), nullable=True))
    op.drop_constraint("ck_order_status", "orders", type_="check")
    op.create_check_constraint("ck_order_status", "orders",
                               "status in ('new','ready','assigned','picked_up','on_the_way','delivered','failed','returned','cancelled')")
    op.alter_column("vehicles", "plate", existing_type=sa.String(20), nullable=True)
    op.drop_constraint("ck_vehicle_type", "vehicles", type_="check")
    op.create_check_constraint("ck_vehicle_type", "vehicles", "type in ('car','scooter','bicycle','foot')")
    for col in ("first_name", "last_name"):
        op.add_column("couriers", sa.Column(col, sa.String(100), nullable=False, server_default=""))
    op.add_column("couriers", sa.Column("email", sa.String(255), nullable=False, server_default=""))
    op.create_table(
        "order_status_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id"), nullable=False, index=True),
        sa.Column("from_status", sa.String(20)), sa.Column("to_status", sa.String(20), nullable=False),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("reason", sa.String(300), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "public_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("token", sa.String(64), nullable=False, unique=True),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id"), index=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)), sa.Column("used_at", sa.DateTime(timezone=True)),
        sa.Column("payload", JSONType, nullable=False, server_default="{}"),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("kind in ('track','pin')", name="ck_public_link_kind"),
    )
    # backfill: one initial event per existing order so old orders still have a timeline
    op.execute("INSERT INTO order_status_events (order_id, from_status, to_status, reason, created_at) "
               "SELECT id, NULL, status, 'migrated', created_at FROM orders")


def downgrade() -> None:
    op.drop_table("public_links")
    op.drop_table("order_status_events")
    for col in ("email", "last_name", "first_name"):
        op.drop_column("couriers", col)
    op.execute("DELETE FROM vehicles WHERE type IN ('bicycle','foot')")
    op.drop_constraint("ck_vehicle_type", "vehicles", type_="check")
    op.create_check_constraint("ck_vehicle_type", "vehicles", "type in ('car','scooter')")
    op.execute("UPDATE vehicles SET plate = 'MIGR-' || id WHERE plate IS NULL")
    op.alter_column("vehicles", "plate", existing_type=sa.String(20), nullable=False)
    op.execute("UPDATE orders SET status = 'picked_up' WHERE status = 'on_the_way'")
    op.drop_constraint("ck_order_status", "orders", type_="check")
    op.create_check_constraint("ck_order_status", "orders", "status in ('new','ready','assigned','picked_up','delivered','failed','returned','cancelled')")
    for col in ("distance_m", "comment", "version"):
        op.drop_column("orders", col)
