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


def test_update_blocked_after_pickup(client, db):
    from app.models import Courier
    from app.seed_demo import seed_demo
    seed_demo(db)
    h = login(client, "api_service@z.local")
    disp = login(client, "dispatcher@z.local")
    oid = client.post("/orders/sync", json=ORDER, headers=h).json()["id"]
    c = db.query(Courier).filter(Courier.full_name == "გიორგი მამულაშვილი").one()
    assert client.post(f"/orders/{oid}/status", json={"status": "ready"}, headers=disp).status_code == 200
    assert client.post(f"/orders/{oid}/assign", json={"courier_id": c.id}, headers=disp).status_code == 200
    assert client.post(f"/orders/{oid}/status", json={"status": "picked_up"}, headers=disp).status_code == 200
    client.post("/orders/sync", json={**ORDER, "delivery_address": "CHANGED"}, headers=h)
    mine = [o for o in client.get("/orders", headers=disp).json() if o["id"] == oid][0]
    assert mine["delivery_address"] != "CHANGED"


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


def _manual(**kw):
    base = {"client_key": "abcdef123456", "pickup_address": "Hub", "pickup_lat": 41.72, "pickup_lon": 44.75,
            "delivery_address": "Vake 1", "delivery_lat": 41.71, "delivery_lon": 44.77, "weight_kg": 3}
    return {**base, **kw}


def test_dispatcher_creates_order_choose_later_and_is_idempotent(client):
    d = login(client, "dispatcher@z.local")
    r1 = client.post("/orders", json=_manual(), headers=d)
    r2 = client.post("/orders", json=_manual(), headers=d)
    assert r1.status_code == 201 and r1.json()["status"] == "ready"
    assert r2.status_code == 200 and r2.json()["created"] is False and r2.json()["id"] == r1.json()["id"]
    assert len(client.get("/orders", headers=d).json()) == 1


def test_manual_order_assigns_courier_and_enforces_capacity(client, db):
    from app.models import DeliveryAssignment
    from app.seed_demo import seed_demo
    from app.models import Courier
    seed_demo(db)
    d = login(client, "dispatcher@z.local")
    scooter = db.query(Courier).filter(Courier.full_name == "ანდრია სუხიშვილი").one()   # scooter, 25 kg
    marsh = db.query(Courier).filter(Courier.full_name == "გიორგი მამულაშვილი").one()   # marshrutka, 1500 kg
    before = db.query(DeliveryAssignment).count()
    heavy = client.post("/orders", json=_manual(client_key="heavy-0001", weight_kg=120, courier_id=scooter.id), headers=d)
    assert heavy.status_code == 409 and "25 kg" in heavy.json()["detail"]
    assert db.query(DeliveryAssignment).count() == before     # nothing half-created
    marsh_before = db.query(DeliveryAssignment).filter_by(courier_id=marsh.id, active=True).count()
    ok = client.post("/orders", json=_manual(client_key="heavy-0002", weight_kg=120, courier_id=marsh.id), headers=d)
    assert ok.status_code == 201 and ok.json()["status"] == "assigned"
    assert db.query(DeliveryAssignment).filter_by(courier_id=marsh.id, active=True).count() == marsh_before + 1
    assert client.post("/orders", json=_manual(client_key="nobody-0001", courier_id=99999), headers=d).status_code == 422


def test_manual_order_permissions_and_validation(client):
    assert client.post("/orders", json=_manual(), headers=login(client, "courier@z.local")).status_code == 403
    assert client.post("/orders", json=_manual(), headers=login(client, "finance_manager@z.local")).status_code == 403
    d = login(client, "dispatcher@z.local")
    assert client.post("/orders", json=_manual(client_key="bad-phone-1", customer_phone="abc"), headers=d).status_code == 422
    assert client.post("/orders", json=_manual(client_key="bad-coord-1", delivery_lat=95), headers=d).status_code == 422


def test_order_list_includes_courier_name_and_created_at(client, db):
    from app.models import Courier
    from app.seed_demo import seed_demo
    seed_demo(db)
    d = login(client, "dispatcher@z.local")
    marsh = db.query(Courier).filter(Courier.full_name == "გიორგი მამულაშვილი").one()
    client.post("/orders", json=_manual(client_key="named-0001", courier_id=marsh.id), headers=d)
    rows = {r["external_id"]: r for r in client.get("/orders?limit=100", headers=d).json()}
    mine = rows["M-named-0001"]
    assert mine["courier_name"] == "გიორგი მამულაშვილი" and mine["created_at"]
    assert rows["DEMO-0001"]["courier_name"] is None
