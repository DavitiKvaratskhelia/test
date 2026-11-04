"""multi-tenancy: tenants, memberships (roles per company), branches, tenant_id on every business table

Existing data becomes company "zoommer"; old admins become owners (and platform admins).

Revision ID: 0006
Revises: 0005
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

JSONType = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
TENANT_TABLES = ["couriers", "vehicles", "orders", "saved_addresses", "zones", "public_links"]


def upgrade() -> None:
    op.create_table(
        "tenants",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(40), nullable=False, unique=True), sa.Column("name", sa.String(120), nullable=False),
        sa.Column("plan", sa.String(20), nullable=False, server_default="pilot"),
        sa.Column("default_locale", sa.String(5), nullable=False, server_default="ka"),
        sa.Column("timezone", sa.String(60), nullable=False, server_default="Asia/Tbilisi"),
        sa.Column("brand_color", sa.String(9), nullable=False, server_default="#F26A1B"),
        sa.Column("logo_text", sa.String(3), nullable=False, server_default=""),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_simulated", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.execute("INSERT INTO tenants (slug, name, logo_text) VALUES ('zoommer', 'Zoommer', 'Z')")
    tid = op.get_bind().execute(sa.text("SELECT id FROM tenants WHERE slug = 'zoommer'")).scalar_one()

    op.add_column("users", sa.Column("is_platform_admin", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column("users", "role_id", existing_type=sa.Integer(), nullable=True)

    op.create_table(
        "memberships",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("role", sa.String(30), nullable=False), sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("branch_ids", JSONType, nullable=False, server_default="[]"),
        sa.Column("expires_at", sa.DateTime(timezone=True)), sa.Column("granted_by", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "tenant_id", name="uq_membership"),
    )
    op.execute(sa.text("""INSERT INTO memberships (user_id, tenant_id, role, is_active)
                          SELECT u.id, :tid, CASE WHEN r.name = 'admin' THEN 'owner' ELSE COALESCE(r.name, 'dispatcher') END, u.is_active
                          FROM users u LEFT JOIN roles r ON r.id = u.role_id""").bindparams(tid=tid))
    op.execute("UPDATE users SET is_platform_admin = true WHERE id IN (SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'admin')")

    op.create_table(
        "branches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("name", sa.String(120), nullable=False), sa.Column("city", sa.String(80), nullable=False, server_default="Tbilisi"),
        sa.Column("address", sa.String(300), nullable=False, server_default=""),
        sa.Column("lat", sa.Float()), sa.Column("lon", sa.Float()),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "name", name="uq_branch_name"),
    )

    for t in TENANT_TABLES:  # add nullable, backfill, then enforce
        op.add_column(t, sa.Column("tenant_id", sa.Integer(), nullable=True))
        op.execute(sa.text(f"UPDATE {t} SET tenant_id = :tid").bindparams(tid=tid))
        op.alter_column(t, "tenant_id", nullable=False)
        op.create_foreign_key(f"fk_{t}_tenant", t, "tenants", ["tenant_id"], ["id"])
        op.create_index(f"ix_{t}_tenant_id", t, ["tenant_id"])
    op.add_column("audit_logs", sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=True))
    op.create_index("ix_audit_logs_tenant_id", "audit_logs", ["tenant_id"])
    op.add_column("orders", sa.Column("branch_id", sa.Integer(), sa.ForeignKey("branches.id"), nullable=True))
    op.create_index("ix_orders_branch_id", "orders", ["branch_id"])
    op.add_column("zones", sa.Column("priority", sa.Integer(), nullable=False, server_default="0"))

    # uniqueness is now per company
    op.drop_constraint("uq_order_external", "orders", type_="unique")
    op.create_unique_constraint("uq_order_external", "orders", ["tenant_id", "source_system", "external_id"])
    op.drop_constraint("vehicles_plate_key", "vehicles", type_="unique")
    op.create_unique_constraint("uq_vehicle_plate", "vehicles", ["tenant_id", "plate"])
    op.drop_constraint("zones_name_key", "zones", type_="unique")
    op.create_unique_constraint("uq_zone_name", "zones", ["tenant_id", "name"])

    op.add_column("app_settings", sa.Column("tenant_id", sa.Integer(), nullable=True))
    op.execute(sa.text("UPDATE app_settings SET tenant_id = :tid").bindparams(tid=tid))
    op.alter_column("app_settings", "tenant_id", nullable=False)
    op.drop_constraint("app_settings_pkey", "app_settings", type_="primary")
    op.create_primary_key("app_settings_pkey", "app_settings", ["tenant_id", "key"])
    op.create_foreign_key("fk_app_settings_tenant", "app_settings", "tenants", ["tenant_id"], ["id"])


def downgrade() -> None:
    # Only safe while a single company remains: per-company uniqueness collapses back to global uniqueness.
    op.drop_constraint("fk_app_settings_tenant", "app_settings", type_="foreignkey")
    op.drop_constraint("app_settings_pkey", "app_settings", type_="primary")
    op.drop_column("app_settings", "tenant_id")
    op.create_primary_key("app_settings_pkey", "app_settings", ["key"])
    op.drop_constraint("uq_zone_name", "zones", type_="unique")
    op.create_unique_constraint("zones_name_key", "zones", ["name"])
    op.drop_constraint("uq_vehicle_plate", "vehicles", type_="unique")
    op.create_unique_constraint("vehicles_plate_key", "vehicles", ["plate"])
    op.drop_constraint("uq_order_external", "orders", type_="unique")
    op.create_unique_constraint("uq_order_external", "orders", ["source_system", "external_id"])
    op.drop_column("zones", "priority")
    op.drop_index("ix_orders_branch_id", "orders")
    op.drop_column("orders", "branch_id")
    op.drop_index("ix_audit_logs_tenant_id", "audit_logs")
    op.drop_column("audit_logs", "tenant_id")
    for t in reversed(TENANT_TABLES):
        op.drop_index(f"ix_{t}_tenant_id", t)
        op.drop_constraint(f"fk_{t}_tenant", t, type_="foreignkey")
        op.drop_column(t, "tenant_id")
    op.drop_table("branches")
    op.drop_table("memberships")
    op.execute("UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'dispatcher') WHERE role_id IS NULL")
    op.alter_column("users", "role_id", existing_type=sa.Integer(), nullable=False)
    op.drop_column("users", "must_change_password")
    op.drop_column("users", "is_platform_admin")
    op.drop_table("tenants")
