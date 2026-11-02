"""Seed roles and a dev admin. Usage: python -m app.seed  (set ADMIN_PASSWORD; never run default in prod)"""
import os

from sqlalchemy import select

from .core_security import Role as R, hash_password
from .db import SessionLocal
from .models import Role, User


def seed(db, admin_email="admin@zoommer.local", admin_password=None):
    for r in R:
        if not db.scalar(select(Role).where(Role.name == r.value)):
            db.add(Role(name=r.value))
    db.flush()
    pw = admin_password or os.environ.get("ADMIN_PASSWORD")
    if pw and not db.scalar(select(User).where(User.email == admin_email)):
        role = db.scalar(select(Role).where(Role.name == R.ADMIN.value))
        db.add(User(email=admin_email, password_hash=hash_password(pw), full_name="Admin", role_id=role.id))
    db.commit()


if __name__ == "__main__":
    with SessionLocal() as s:
        seed(s)
