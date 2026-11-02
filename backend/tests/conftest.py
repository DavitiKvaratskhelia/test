import os

os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "sqlite:///:memory:")
os.environ["ENVIRONMENT"] = "test"

import pytest
from fastapi.testclient import TestClient

from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import Courier, User, Role
from app.seed import seed
from app.core_security import hash_password


@pytest.fixture()
def db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as s:
        seed(s, admin_password="adminpass")
        for name in ("dispatcher", "courier", "finance_manager", "api_service", "operations_manager"):
            r = s.query(Role).filter_by(name=name).one()
            s.add(User(email=f"{name}@z.local", password_hash=hash_password("pw"), role_id=r.id))
        s.commit()
        yield s


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
def courier_ctx(client, db, admin):
    """A consenting courier bound to the 'courier' user."""
    u = db.query(User).filter_by(email="courier@z.local").one()
    c = Courier(full_name="Test Courier", user_id=u.id)
    db.add(c); db.commit()
    h = login(client, "courier@z.local")
    assert client.post(f"/fleet/couriers/{c.id}/consent", headers=h).status_code == 200
    return c.id, h
