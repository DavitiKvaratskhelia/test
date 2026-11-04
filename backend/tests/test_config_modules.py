from app.services.geo import point_in_polygon, valid_ring

from .conftest import login

SQUARE = [[44.0, 41.0], [45.0, 41.0], [45.0, 42.0], [44.0, 42.0]]


def test_point_in_polygon_and_validation():
    assert point_in_polygon(41.5, 44.5, SQUARE) and not point_in_polygon(43, 44.5, SQUARE)
    concave = [[0, 0], [4, 0], [4, 4], [2, 1], [0, 4]]  # notch cut from the top
    assert point_in_polygon(0.5, 2, concave) and not point_in_polygon(3, 2, concave)
    assert valid_ring(SQUARE) and not valid_ring([[1, 2], [3, 4]]) and not valid_ring([[999, 0], [1, 1], [2, 2]])


def test_saved_addresses_crud_search_pagination(client):
    d = login(client, "dispatcher@z.local")
    for i in range(15):
        r = client.post("/addresses", headers=d, json={"name": f"Place {i:02d}", "address": "Tbilisi", "phone": "+995 591 000 000"})
        assert r.status_code == 201
    page1 = client.get("/addresses?limit=12", headers=d).json()
    assert page1["total"] == 15 and len(page1["items"]) == 12
    assert len(client.get("/addresses?limit=12&offset=12", headers=d).json()["items"]) == 3
    assert client.get("/addresses?q=place 07", headers=d).json()["total"] == 1
    aid = page1["items"][0]["id"]
    assert client.put(f"/addresses/{aid}", headers=d, json={"name": "Renamed", "address": "X"}).json()["name"] == "Renamed"
    assert client.delete(f"/addresses/{aid}", headers=d).status_code == 204
    assert client.post("/addresses", headers=d, json={"name": "x", "address": "y", "phone": "abc"}).status_code == 422
    assert client.get("/addresses", headers=login(client, "courier@z.local")).status_code == 403


def test_zones_create_assign_couriers_and_lookup(client, db, tid):
    from app.models import Courier
    ops = login(client, "operations_manager@z.local")
    disp = login(client, "dispatcher@z.local")
    assert client.post("/zones", headers=disp, json={"name": "Z", "polygon": SQUARE}).status_code == 403
    assert client.post("/zones", headers=ops, json={"name": "Z", "polygon": [[1, 2]]}).status_code == 422
    z = client.post("/zones", headers=ops, json={"name": "Z", "polygon": SQUARE}).json()
    assert client.post("/zones", headers=ops, json={"name": "Z", "polygon": SQUARE}).status_code == 409
    c = Courier(full_name="C", tenant_id=tid); db.add(c); db.commit()
    assert client.put(f"/zones/{z['id']}/couriers", headers=ops, json={"courier_ids": [c.id, 999]}).status_code == 422
    assert client.put(f"/zones/{z['id']}/couriers", headers=ops, json={"courier_ids": [c.id]}).json()["courier_ids"] == [c.id]
    assert [h["name"] for h in client.get("/zones/lookup?lat=41.5&lon=44.5", headers=disp).json()] == ["Z"]
    assert client.get("/zones/lookup?lat=50&lon=44.5", headers=disp).json() == []
    assert client.delete(f"/zones/{z['id']}", headers=ops).status_code == 204


def test_order_gets_zone_from_polygon(client):
    ops = login(client, "operations_manager@z.local")
    client.post("/zones", headers=ops, json={"name": "Box", "polygon": SQUARE})
    api = login(client, "api_service@z.local")
    r = client.post("/orders/sync", headers=api, json={"source_system": "erp", "external_id": "Z1", "delivery_address": "x",
                                                      "delivery_lat": 41.5, "delivery_lon": 44.5})
    assert r.status_code == 201
    assert client.get("/orders", headers=ops).json()[0]["zone"] == "Box"


def test_user_management_and_guards(client, admin, db):
    r = client.post("/users", headers=admin, json={"email": "New@Z.com", "password": "longenough1", "role": "dispatcher", "full_name": "N"})
    assert r.status_code == 201 and r.json()["email"] == "new@z.com" and "password_hash" not in str(r.json()) and "longenough1" not in str(r.json())
    assert client.post("/users", headers=admin, json={"email": "new@z.com", "password": "longenough1", "role": "dispatcher"}).status_code == 409
    assert client.post("/users", headers=admin, json={"email": "a@z.com", "password": "short", "role": "dispatcher"}).status_code == 422
    assert client.post("/users", headers=admin, json={"email": "a@z.com", "password": "longenough1", "role": "root"}).status_code == 422
    assert login(client, "new@z.com", "longenough1")  # new user can log in
    uid = r.json()["id"]
    assert client.patch(f"/users/{uid}", headers=admin, json={"role": "finance_manager"}).json()["role"] == "finance_manager"
    assert client.patch(f"/users/{uid}", headers=admin, json={"is_active": False}).json()["is_active"] is False
    assert client.post("/auth/login", json={"email": "new@z.com", "password": "longenough1"}).status_code == 401
    me = client.get("/auth/me", headers=admin).json()["id"]
    assert client.patch(f"/users/{me}", headers=admin, json={"role": "dispatcher"}).status_code == 409   # last admin / self
    assert client.patch(f"/users/{me}", headers=admin, json={"is_active": False}).status_code == 409
    assert client.get("/users", headers=login(client, "dispatcher@z.local")).status_code == 403
    assert client.get("/users", headers=admin).status_code == 200


def test_password_reset_not_audited_in_plaintext(client, admin, db):
    from app.models import AuditLog
    uid = client.post("/users", headers=admin, json={"email": "p@z.com", "password": "longenough1", "role": "courier"}).json()["id"]
    client.patch(f"/users/{uid}", headers=admin, json={"password": "secret-new-pass"})
    assert "secret-new-pass" not in str([a.detail for a in db.query(AuditLog)])


def test_settings_validation_and_permissions(client, admin):
    ops = login(client, "operations_manager@z.local")
    assert client.get("/settings", headers=login(client, "finance_manager@z.local")).json()["delivery"]["max_active_orders_per_courier"] == 8
    assert client.put("/settings/delivery", headers=login(client, "dispatcher@z.local"), json={}).status_code == 403
    r = client.put("/settings/geolocation", headers=ops, json={"gps_interval_s": 30, "realtime_max_age_s": 90, "delayed_max_age_s": 400, "retention_days": 14})
    assert r.status_code == 200 and client.get("/settings", headers=ops).json()["geolocation"]["gps_interval_s"] == 30
    assert client.put("/settings/geolocation", headers=ops, json={"realtime_max_age_s": 100, "delayed_max_age_s": 50}).status_code == 422
    assert client.put("/settings/delivery", headers=ops, json={"max_active_orders_per_courier": 0}).status_code == 422
    assert client.put("/settings/nope", headers=ops, json={}).status_code == 404
