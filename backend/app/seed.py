"""Seed roles, the default company and a first admin. Usage: python -m app.seed  (set ADMIN_PASSWORD; never run default in prod)"""
import os

from sqlalchemy import select

from .core_security import COMPANY_ROLES, hash_password
from .db import SessionLocal
from .models import Membership, Role, Tenant, User

DEFAULT_SLUG, DEFAULT_NAME = "zoommer", "Zoommer"


def ensure_tenant(db, slug: str = DEFAULT_SLUG, name: str = DEFAULT_NAME, **kw) -> Tenant:
    t = db.scalar(select(Tenant).where(Tenant.slug == slug))
    if not t:
        t = Tenant(slug=slug, name=name, **({"brand_color": "#F26A1B", "logo_text": name[:1].upper()} | kw))
        db.add(t)
        db.flush()
    return t


def seed(db, admin_email="admin@zoommer.local", admin_password=None) -> Tenant:
    for r in COMPANY_ROLES:  # legacy lookup table, still referenced by users.role_id
        if not db.scalar(select(Role).where(Role.name == r)):
            db.add(Role(name=r))
    db.flush()
    tenant = ensure_tenant(db)
    pw = admin_password or os.environ.get("ADMIN_PASSWORD")
    if pw and not db.scalar(select(User).where(User.email == admin_email)):
        u = User(email=admin_email, password_hash=hash_password(pw), full_name="Admin", is_platform_admin=True)
        db.add(u)
        db.flush()
        db.add(Membership(user_id=u.id, tenant_id=tenant.id, role="owner"))
    db.commit()
    return tenant


if __name__ == "__main__":
    with SessionLocal() as s:
        seed(s)
