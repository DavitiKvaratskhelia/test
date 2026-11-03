"""Create or update a user. The password is read from CREATE_USER_PASSWORD or prompted; never passed as an argument
(shell history) and never stored in the repo.

Usage:
  CREATE_USER_PASSWORD='...' python -m app.create_user --email you@example.com --role admin
"""
import argparse
import getpass
import os

from sqlalchemy import select

from .core_security import Role as R, hash_password
from .db import SessionLocal
from .models import Role, User
from .seed import seed


def create_user(db, email: str, password: str, role: str = "admin", full_name: str = "") -> tuple[User, bool]:
    if role not in {r.value for r in R}:
        raise ValueError(f"unknown role {role!r}")
    if len(password) < 8:
        raise ValueError("password must be at least 8 characters")
    seed(db)  # make sure roles exist
    email = email.strip().lower()  # login lowercases the email, so store it lowercased
    role_row = db.scalar(select(Role).where(Role.name == role))
    user = db.scalar(select(User).where(User.email == email))
    created = user is None
    if created:
        user = User(email=email, password_hash=hash_password(password), full_name=full_name, role_id=role_row.id)
        db.add(user)
    else:
        user.password_hash, user.role_id, user.is_active = hash_password(password), role_row.id, True
    db.commit()
    return user, created


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--email", required=True)
    ap.add_argument("--role", default="admin")
    ap.add_argument("--name", default="")
    a = ap.parse_args()
    pw = os.environ.get("CREATE_USER_PASSWORD") or getpass.getpass("Password: ")
    with SessionLocal() as s:
        u, created = create_user(s, a.email, pw, a.role, a.name)
        print(f"{'created' if created else 'updated'}: {u.email} ({a.role})")
