import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import pytest

from app.models import Courier, PublicLink
from app.seed_demo import seed_demo

from .conftest import login


def _manual(key="life-0001", **kw):
    base = {"client_key": key, "pickup_address": "Hub", "pickup_branch": "Demo Hub", "pickup_lat": 41.726, "pickup_lon": 44.751,
            "delivery_address": "Vake 1", "delivery_lat": 41.709, "delivery_lon": 44.770, "weight_kg": 3, "customer_name": "Nino",
            "customer_phone": "+995 555 111 222"}
    return {**base, **kw}


def courier(db, name):
    return db.query(Courier).filter(Courier.full_name == name).one()


MARSH, SCOOTER, SCOOTER2 = "გიორგი მამულაშვილი", "ანდრია სუხიშვილი", "საბა ნოზაძე"


def test_full_lifecycle_with_timeline_and_rules(client, db):
    seed_demo(db)
    d = login(client, "dispatcher@z.local")
    o = client.post("/orders", json=_manual(courier_id=courier(db, MARSH).id), headers=d).json()
    assert o["status"] == "assigned" and o["courier_name"] == MARSH
    oid = o["id"]
    for to in ("picked_up", "on_the_way", "delivered"):
        r = client.post(f"/orders/{oid}/status", json={"status": to}, headers=d)
        assert r.status_code == 200 and r.json()["status"] == to
    detail = client.get(f"/orders/{oid}", headers=d).json()
    assert [e["to"] for e in detail["events"]] == ["ready", "assigned", "picked_up", "on_the_way", "delivered"]
    assert all(e["at"] for e in detail["events"]) and detail["allowed_next"] == ["returned"]
    # a delivered order cannot be reopened
    assert client.post(f"/orders/{oid}/status", json={"status": "ready"}, headers=d).status_code == 409


def test_status_rules(client, db):
    seed_demo(db)
    d = login(client, "dispatcher@z.local")
    free = client.post("/orders", json=_manual("rules-0001"), headers=d).json()           # ready, no courier
    assert client.post(f"/orders/{free['id']}/status", json={"status": "picked_up"}, headers=d).status_code == 409   # skips assignment
    assert client.post(f"/orders/{free['id']}/status", json={"status": "assigned"}, headers=d).status_code == 409    # must use assign
    mine = client.post("/orders", json=_manual("rules-0002", courier_id=courier(db, SCOOTER).id), headers=d).json()
    client.post(f"/orders/{mine['id']}/status", json={"status": "picked_up"}, headers=d)
    client.post(f"/orders/{mine['id']}/status", json={"status": "on_the_way"}, headers=d)
    assert client.post(f"/orders/{mine['id']}/status", json={"status": "failed"}, headers=d).status_code == 422   # reason required
    r = client.post(f"/orders/{mine['id']}/status", json={"status": "failed", "reason": "recipient unreachable"}, headers=d)
    assert r.status_code == 200
    ev = client.get(f"/orders/{mine['id']}", headers=d).json()["events"][-1]
    assert ev["to"] == "failed" and ev["reason"] == "recipient unreachable"      # every attempt keeps its reason
    assert client.post(f"/orders/{mine['id']}/status", json={"status": "ready"}, headers=d).json()["courier_name"] is None   # retry frees the courier


def test_assign_reassign_unassign_and_capacity(client, db):
    seed_demo(db)
    d = login(client, "dispatcher@z.local")
    heavy = client.post("/orders", json=_manual("cap-0001", weight_kg=120), headers=d).json()
    r = client.post(f"/orders/{heavy['id']}/assign", json={"courier_id": courier(db, SCOOTER).id}, headers=d)
    assert r.status_code == 409 and "25 kg" in r.json()["detail"]
    a = client.post(f"/orders/{heavy['id']}/assign", json={"courier_id": courier(db, MARSH).id}, headers=d).json()
    assert a["status"] == "assigned" and a["courier_name"] == MARSH
    light = client.post("/orders", json=_manual("cap-0002", courier_id=courier(db, SCOOTER).id), headers=d).json()
    b = client.post(f"/orders/{light['id']}/assign", json={"courier_id": courier(db, SCOOTER2).id}, headers=d).json()
    assert b["courier_name"] == SCOOTER2                                            # reassigned, previous assignment ended
    from app.models import DeliveryAssignment
    assert db.query(DeliveryAssignment).filter_by(order_id=light["id"], active=True).count() == 1
    assert client.post(f"/orders/{light['id']}/assign", json={"courier_id": None}, headers=d).json()["status"] == "ready"
    client.post(f"/orders/{light['id']}/assign", json={"courier_id": courier(db, SCOOTER).id}, headers=d)
    client.post(f"/orders/{light['id']}/status", json={"status": "picked_up"}, headers=d)
    assert client.post(f"/orders/{light['id']}/assign", json={"courier_id": courier(db, SCOOTER2).id}, headers=d).status_code == 409  # after pickup
    assert client.post(f"/orders/{light['id']}/assign", json={"courier_id": 9999}, headers=d).status_code in (409, 422)
    assert client.post(f"/orders/{light['id']}/assign", json={"courier_id": 1}, headers=login(client, "courier@z.local")).status_code == 403


def test_stale_version_is_a_conflict(client, db):
    seed_demo(db)
    d = login(client, "dispatcher@z.local")
    o = client.post("/orders", json=_manual("ver-0001"), headers=d).json()
    ok = client.post(f"/orders/{o['id']}/assign", json={"courier_id": courier(db, MARSH).id, "expected_version": o["version"]}, headers=d)
    assert ok.status_code == 200
    stale = client.post(f"/orders/{o['id']}/status", json={"status": "cancelled", "expected_version": o["version"]}, headers=d)
    assert stale.status_code == 409 and "changed by someone else" in stale.json()["detail"]


@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="needs real PostgreSQL (TEST_DATABASE_URL)")
def test_two_dispatchers_assign_at_once_one_active_courier(client, db):
    seed_demo(db)
    d = login(client, "dispatcher@z.local")
    o = client.post("/orders", json=_manual("race-0001"), headers=d).json()
    ids = [courier(db, MARSH).id, courier(db, SCOOTER).id, courier(db, SCOOTER2).id]
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(lambda cid: client.post(f"/orders/{o['id']}/assign", json={"courier_id": cid}, headers=d), ids * 2))
    assert {r.status_code for r in res} <= {200, 409} and any(r.status_code == 200 for r in res)
    from app.models import DeliveryAssignment
    db.expire_all()
    assert db.query(DeliveryAssignment).filter_by(order_id=o["id"], active=True).count() == 1


def test_distance_and_indicative_price(client, db):
    d = login(client, "dispatcher@z.local")
    ops = login(client, "operations_manager@z.local")
    o = client.post("/orders", json=_manual("dist-0001"), headers=d).json()
    assert 2000 < o["distance_m"] < 3500 and o["distance_is_straight_line"] is True and o["price"] is None   # no tariff configured yet
    client.put("/settings/payment", json={"currency": "GEL", "base_rate": 3, "per_km_rate": 0.5}, headers=ops)
    p = [x for x in client.get("/orders", headers=d).json() if x["id"] == o["id"]][0]
    assert p["price"] == round(3 + 0.5 * o["distance_m"] / 1000, 2) and p["currency"] == "GEL"


def test_tracking_link_is_minimal_revocable_and_expiring(client, db):
    seed_demo(db)
    d = login(client, "dispatcher@z.local")
    mine = client.post("/orders", json=_manual("trk-0001", courier_id=courier(db, SCOOTER).id), headers=d).json()
    other = client.post("/orders", json=_manual("trk-0002", delivery_address="SECRET OTHER ADDRESS"), headers=d).json()
    link = client.post(f"/orders/{mine['id']}/links", headers=d).json()
    assert link["path"].startswith("/track/") and len(link["token"]) >= 24
    assert client.post(f"/orders/{mine['id']}/links", headers=d).json()["token"] == link["token"]       # reused while valid
    pub = client.get(f"/public/track/{link['token']}").json()                                            # no auth header at all
    text = str(pub)
    assert pub["status"] == "assigned" and pub["delivery_address"] == "Vake 1" and pub["courier_first_name"] == "ანდრია"
    assert "SECRET OTHER ADDRESS" not in text and "+995 555 000" not in text and pub["courier_location"] is None
    for to in ("picked_up", "on_the_way"):
        client.post(f"/orders/{mine['id']}/status", json={"status": to}, headers=d)
    live = client.get(f"/public/track/{link['token']}").json()
    assert live["courier_location"] and live["courier_location"]["age_seconds"] < 3600     # demo courier ANDRIA is realtime
    client.post(f"/orders/{mine['id']}/status", json={"status": "delivered"}, headers=d)
    done = client.get(f"/public/track/{link['token']}").json()
    assert done["terminal"] is True and done["courier_location"] is None                                 # sharing ends at delivery
    assert client.delete(f"/orders/links/{link['token']}", headers=d).status_code == 204
    assert client.get(f"/public/track/{link['token']}").status_code == 404
    assert client.get("/public/track/not-a-real-token").status_code == 404
    l2 = client.post(f"/orders/{other['id']}/links", headers=d).json()
    row = db.query(PublicLink).filter_by(token=l2["token"]).one()
    row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1); db.commit()
    assert client.get(f"/public/track/{l2['token']}").status_code == 404                                # expired looks the same as unknown


def test_stale_courier_position_never_shown_to_customer(client, db):
    seed_demo(db)
    d = login(client, "dispatcher@z.local")
    c = courier(db, "ბექა თოფურიძე")  # scooter with a very old fix in the demo data
    heavy = client.post("/orders", json=_manual("stl-0001", courier_id=c.id), headers=d).json()
    for to in ("picked_up", "on_the_way"):
        client.post(f"/orders/{heavy['id']}/status", json={"status": to}, headers=d)
    tok = client.post(f"/orders/{heavy['id']}/links", headers=d).json()["token"]
    assert client.get(f"/public/track/{tok}").json()["courier_location"] is None


def test_get_the_pin_flow(client, db):
    d = login(client, "dispatcher@z.local")
    p = client.post("/pins", headers=d).json()
    assert p["state"] == "pending" and p["path"].startswith("/pin/")
    info = client.get(f"/public/pin/{p['token']}").json()
    assert info["submitted"] is False and info["company"]
    assert client.post(f"/public/pin/{p['token']}", json={"lat": 95, "lon": 44}).status_code == 422
    assert client.post(f"/public/pin/{p['token']}", json={"lat": 41.7, "lon": 44.8}).json()["submissions"] == 1
    assert client.post(f"/public/pin/{p['token']}", json={"lat": 41.71, "lon": 44.81}).json()["submissions"] == 2   # customer corrects it
    got = client.get(f"/pins/{p['id']}", headers=d).json()
    assert got["state"] == "done" and (got["lat"], got["lon"]) == (41.71, 44.81)
    assert client.get("/pins", headers=d).json()[0]["id"] == p["id"]
    assert client.post("/pins", headers=login(client, "courier@z.local")).status_code == 403
    assert client.get("/public/pin/nope").status_code == 404
    db.query(PublicLink).filter_by(token=p["token"]).one().expires_at = datetime.now(timezone.utc) - timedelta(seconds=1); db.commit()
    assert client.post(f"/public/pin/{p['token']}", json={"lat": 41.7, "lon": 44.8}).status_code == 404


def test_courier_crud_with_transport_kinds(client, db):
    ops = login(client, "operations_manager@z.local")
    body = {"first_name": "Test", "last_name": "Courier", "email": "t@example.com", "phone": "+995 555 123 456", "transport": "truck"}
    c = client.post("/fleet/couriers", json=body, headers=ops).json()
    assert c["full_name"] == "Test Courier" and c["transport"] == "truck" and c["capacity_kg"] == 1500
    u = client.put(f"/fleet/couriers/{c['id']}", json={**body, "transport": "bicycle", "capacity_kg": 12}, headers=ops).json()
    assert u["transport"] == "bicycle" and u["capacity_kg"] == 12 and u["vehicle_type"] == "bicycle"
    ped = client.post("/fleet/couriers", json={**body, "first_name": "Walker", "transport": "pedestrian"}, headers=ops).json()
    assert ped["vehicle_type"] == "foot"
    off = client.put(f"/fleet/couriers/{c['id']}", json={**body, "active": False}, headers=ops).json()
    assert off["active"] is False
    names = lambda r: {x["full_name"] for x in r.json()}
    assert "Test Courier" not in names(client.get("/fleet/couriers", headers=ops))
    assert "Test Courier" in names(client.get("/fleet/couriers?include_inactive=true", headers=ops))
    assert client.post("/fleet/couriers", json={**body, "email": "not-an-email"}, headers=ops).status_code == 422
    assert client.post("/fleet/couriers", json={**body, "transport": "rocket"}, headers=ops).status_code == 422
    assert client.post("/fleet/couriers", json=body, headers=login(client, "dispatcher@z.local")).status_code == 403


def test_profile_and_password_change(client, admin):
    assert client.patch("/auth/me", json={"full_name": "Boss"}, headers=admin).json()["full_name"] == "Boss"
    assert client.patch("/auth/me", json={"new_password": "newpassword1"}, headers=admin).status_code == 403          # needs current
    assert client.patch("/auth/me", json={"current_password": "wrong", "new_password": "newpassword1"}, headers=admin).status_code == 403
    assert client.patch("/auth/me", json={"current_password": "adminpass", "new_password": "short"}, headers=admin).status_code == 422
    assert client.patch("/auth/me", json={"current_password": "adminpass", "new_password": "newpassword1"}, headers=admin).status_code == 200
    assert client.post("/auth/login", json={"email": "admin@zoommer.local", "password": "newpassword1"}).status_code == 200
    assert client.post("/auth/login", json={"email": "admin@zoommer.local", "password": "adminpass"}).status_code == 401
