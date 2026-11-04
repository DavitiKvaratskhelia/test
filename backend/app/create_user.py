"""Create or update a login and give it a role in a company. The password is read from CREATE_USER_PASSWORD or prompted;
never passed as an argument (shell history) and never stored in the repo.

Usage:
  CREATE_USER_PASSWORD='...' python -m app.create_user --email you@example.com --role owner [--tenant zoommer] [--platform-admin]
"""
import argparse
import getpass
import os

from sqlalchemy import select

from .core_security import COMPANY_ROLES, hash_password
from .db import SessionLocal
from .models import Membership, User
from .seed import DEFAULT_SLUG, ensure_tenant, seed


def create_user(db, email: str, password: str, role: str = "owner", full_name: str = "", tenant_slug: str = DEFAULT_SLUG,
                platform_admin: bool | None = None) -> tuple[User, bool]:
    if role not in COMPANY_ROLES:
        raise ValueError(f"unknown role {role!r}")
    if len(password) < 8:
        raise ValueError("password must be at least 8 characters")
    seed(db)  # roles + default company
    tenant = ensure_tenant(db, tenant_slug) if tenant_slug != DEFAULT_SLUG else ensure_tenant(db)
    email = email.strip().lower()  # login lowercases the email, so store it lowercased
    user = db.scalar(select(User).where(User.email == email))
    created = user is None
    if created:
        user = User(email=email, password_hash=hash_password(password), full_name=full_name)
        db.add(user)
        db.flush()
    else:
        user.password_hash, user.is_active = hash_password(password), True
    if platform_admin is not None:
        user.is_platform_admin = platform_admin
    m = db.scalar(select(Membership).where(Membership.user_id == user.id, Membership.tenant_id == tenant.id))
    if m:
        m.role, m.is_active = role, True
    else:
        db.add(Membership(user_id=user.id, tenant_id=tenant.id, role=role))
    db.commit()
    return user, created


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--email", required=True)
    ap.add_argument("--role", default="owner")
    ap.add_argument("--name", default="")
    ap.add_argument("--tenant", default=DEFAULT_SLUG)
    ap.add_argument("--platform-admin", action="store_true")
    a = ap.parse_args()
    pw = os.environ.get("CREATE_USER_PASSWORD") or getpass.getpass("Password: ")
    with SessionLocal() as s:
        u, created = create_user(s, a.email, pw, a.role, a.name, a.tenant, True if a.platform_admin else None)
        print(f"{'created' if created else 'updated'}: {u.email} ({a.role} @ {a.tenant})")
