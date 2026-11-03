import pytest

from app.create_user import create_user
from .conftest import login


def test_create_user_can_login_and_is_updatable(client, db):
    u, created = create_user(db, "Someone@Example.com", "longenough1", "admin")
    assert created and u.email == "someone@example.com"
    assert client.get("/auth/me", headers=login(client, "SOMEONE@example.com", "longenough1")).json()["role"] == "admin"
    _, created2 = create_user(db, "someone@example.com", "another-pass-2", "dispatcher")
    assert not created2
    assert client.get("/auth/me", headers=login(client, "someone@example.com", "another-pass-2")).json()["role"] == "dispatcher"


def test_rejects_weak_password_and_bad_role(db):
    with pytest.raises(ValueError):
        create_user(db, "a@b.com", "short")
    with pytest.raises(ValueError):
        create_user(db, "a@b.com", "longenough1", "root")
