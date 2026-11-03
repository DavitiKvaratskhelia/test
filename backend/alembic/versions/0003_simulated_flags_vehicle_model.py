"""simulated flags (couriers, vehicles, orders) and vehicles.model

Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for t in ("couriers", "vehicles", "orders"):
        op.add_column(t, sa.Column("is_simulated", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("vehicles", sa.Column("model", sa.String(60), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("vehicles", "model")
    for t in ("couriers", "vehicles", "orders"):
        op.drop_column(t, "is_simulated")
