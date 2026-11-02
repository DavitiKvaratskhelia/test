import os

import pytest
from concurrent.futures import ThreadPoolExecutor

from .conftest import login

ORDER = {"source_system": "erp", "external_id": "SO-1001", "delivery_address": "Rustaveli Ave 1, Tbilisi",
         "delivery_lat": 41.6938, "delivery_lon": 44.8015, "weight_kg": 3.2}


def test_duplicate_order_prevention(client):
    h = login(client, "api_service@z.local")
    r1 = client.post("/orders/sync", json=ORDER, headers=h)
    r2 = client.post("/orders/sync", json=ORDER, headers=h)
    assert r1.status_code == 201 and r1.json()["created"] is True
    assert r2.status_code == 200 and r2.json()["created"] is False
    assert r1.json()["id"] == r2.json()["id"]
    disp = login(client, "dispatcher@z.local")
    assert len(client.get("/orders", headers=disp).json()) == 1


@pytest.mark.skipif(not os.environ.get('TEST_DATABASE_URL'), reason='needs real PostgreSQL (TEST_DATABASE_URL)')
def test_concurrent_sync_creates_one(client):
    h = login(client, "api_service@z.local")
    with ThreadPoolExecutor(8) as ex:
        res = list(ex.map(lambda _: client.post("/orders/sync", json=ORDER, headers=h), range(8)))
    assert all(r.status_code in (200, 201) for r in res)
    assert len({r.json()["id"] for r in res}) == 1


def test_update_blocked_after_pickup(client):
    h = login(client, "api_service@z.local")
    disp = login(client, "dispatcher@z.local")
    oid = client.post("/orders/sync", json=ORDER, headers=h).json()["id"]
    for s in ("ready", "assigned", "picked_up"):
        assert client.post(f"/orders/{oid}/status", json={"status": s}, headers=disp).status_code == 200
    client.post("/orders/sync", json={**ORDER, "delivery_address": "CHANGED"}, headers=h)
    assert client.get("/orders", headers=disp).json()[0]["delivery_address"] != "CHANGED"


def test_illegal_transition(client):
    h = login(client, "api_service@z.local")
    disp = login(client, "dispatcher@z.local")
    oid = client.post("/orders/sync", json=ORDER, headers=h).json()["id"]
    assert client.post(f"/orders/{oid}/status", json={"status": "delivered"}, headers=disp).status_code == 409


def test_api_service_cannot_list_orders(client):
    assert client.get("/orders", headers=login(client, "api_service@z.local")).status_code == 403


def test_invalid_coordinates_rejected(client):
    h = login(client, "api_service@z.local")
    assert client.post("/orders/sync", json={**ORDER, "delivery_lat": 95}, headers=h).status_code == 422
