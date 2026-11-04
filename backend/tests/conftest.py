import os

os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "sqlite:///:memory:")
os.environ["ENVIRONMENT"] = "test"

import pytest
from fastapi.testclient import TestClient

from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import Courier, Membership, Tenant, User
from app.seed import seed
from app.core_security import hash_password


def make_user(db, email, role, tenant_id, pw="pw", branch_ids=None, platform_admin=False):
    """A login with a role in one company (roles live on the membership, not on the user)."""
    u = db.query(User).filter_by(email=email).first()
    if not u:
        u = User(email=email, password_hash=hash_password(pw), is_platform_admin=platform_admin)
        db.add(u)
        db.flush()
    db.add(Membership(user_id=u.id, tenant_id=tenant_id, role=role, branch_ids=branch_ids or []))
    db.commit()
    return u


def make_tenant(db, slug, name=None, **kw):
    t = Tenant(slug=slug, name=name or slug.title(), **kw)
    db.add(t)
    db.commit()
    return t


@pytest.fixture()
def db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as s:
        tenant = seed(s, admin_password="adminpass")
        for name in ("dispatcher", "courier", "finance_manager", "api_service", "operations_manager"):
            make_user(s, f"{name}@z.local", name, tenant.id)
        yield s


@pytest.fixture()
def tid(db):
    """Id of the default company (Zoommer)."""
    return db.query(Tenant).filter_by(slug="zoommer").one().id


@pytest.fixture()
def client(db):
    return TestClient(app)


def login(client, email, pw="pw"):
    r = client.post("/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture()
def admin(client):
    return login(client, "admin@zoommer.local", "adminpass")


@pytest.fixture()
def courier_ctx(client, db, admin, tid):
    """A consenting courier bound to the 'courier' user."""
    u = db.query(User).filter_by(email="courier@z.local").one()
    c = Courier(full_name="Test Courier", user_id=u.id, tenant_id=tid)
    db.add(c); db.commit()
    h = login(client, "courier@z.local")
    assert client.post(f"/fleet/couriers/{c.id}/consent", headers=h).status_code == 200
    return c.id, h
