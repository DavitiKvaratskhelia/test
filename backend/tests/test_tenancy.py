"""Company isolation. Every case logs in as a member of company B and reaches for company A's data — by list, by direct id,
by public link and by mixing ids across companies. The right answer is always "not found", never "forbidden" or data."""
from datetime import datetime, timedelta, timezone

import pytest

from app.models import Branch, Courier, Membership, PublicLink, Tenant, User, Zone
from app.seed_demo import seed_demo

from .conftest import login, make_tenant, make_user


@pytest.fixture()
def two(client, db, tid):
    """Company A = Zoommer (demo data, many orders); company B = an empty company with its own owner and dispatcher."""
    seed_demo(db)
    b = make_tenant(db, "acme", "Acme Delivery", brand_color="#123456", logo_text="AC")
    make_user(db, "owner@acme.test", "owner", b.id)
    make_user(db, "disp@acme.test", "dispatcher", b.id)
    a_disp = login(client, "dispatcher@z.local")
    b_owner, b_disp = login(client, "owner@acme.test"), login(client, "disp@acme.test")
    return {"a": tid, "b": b.id, "a_disp": a_disp, "b_owner": b_owner, "b_disp": b_disp}


def _a_order(client, two):
    return client.get("/orders?limit=5", headers=two["a_disp"]).json()[0]


def test_lists_never_leak(client, two):
    h = two["b_owner"]
    for path in ("/orders", "/fleet/couriers", "/addresses", "/zones", "/pins", "/branches"):
        r = client.get(path, headers=h)
        body = r.json()
        assert r.status_code == 200, path
        assert (body["items"] if isinstance(body, dict) and "items" in body else body) == [], f"{path} leaked data"
    assert [u["email"] for u in client.get("/users", headers=h).json()] == ["owner@acme.test", "disp@acme.test"] or \
           {u["email"] for u in client.get("/users", headers=h).json()} == {"owner@acme.test", "disp@acme.test"}


def test_direct_id_access_is_404_everywhere(client, db, two):
    o = _a_order(client, two)
    ga = db.query(Courier).filter_by(tenant_id=two["a"]).first()
    za = db.query(Zone).filter_by(tenant_id=two["a"]).first()
    ua = db.query(User).filter_by(email="dispatcher@z.local").one()
    h = two["b_owner"]
    probes = [
        ("get", f"/orders/{o['id']}", None), ("post", f"/orders/{o['id']}/status", {"status": "cancelled"}),
        ("post", f"/orders/{o['id']}/assign", {"courier_id": None}), ("patch", f"/orders/{o['id']}", {"comment": "hax"}),
        ("post", f"/orders/{o['id']}/links", None),
        ("put", f"/fleet/couriers/{ga.id}", {"first_name": "X", "transport": "car"}), ("get", f"/fleet/couriers/{ga.id}/history", None),
        ("post", f"/fleet/couriers/{ga.id}/consent", None),
        ("put", f"/zones/{za.id}", {"name": "X", "polygon": [[1, 1], [2, 2], [3, 1]]}), ("delete", f"/zones/{za.id}", None),
        ("put", f"/zones/{za.id}/couriers", {"courier_ids": []}),
        ("patch", f"/users/{ua.id}", {"role": "courier"}),
    ]
    for method, path, body in probes:
        r = getattr(client, method)(path, headers=h, **({"json": body} if body is not None else {}))
        assert r.status_code == 404, f"{method.upper()} {path} -> {r.status_code} {r.text[:80]}"
    adr = client.get("/addresses", headers=two["a_disp"]).json()["items"][0]["id"]
    assert client.put(f"/addresses/{adr}", headers=h, json={"name": "x", "address": "y"}).status_code == 404
    assert client.delete(f"/addresses/{adr}", headers=h).status_code == 404
    # nothing changed in company A
    assert client.get(f"/orders/{o['id']}", headers=two["a_disp"]).json()["status"] == o["status"]


def test_mixing_ids_across_companies_is_rejected(client, db, two):
    """B's own order + A's courier / zone-courier / vehicle must not be combinable."""
    b = two["b"]
    mine = client.post("/orders", headers=two["b_disp"], json={"client_key": "acme-order-1", "pickup_address": "p", "delivery_address": "d", "weight_kg": 1}).json()
    a_courier = db.query(Courier).filter_by(tenant_id=two["a"], active=True).first()
    r = client.post(f"/orders/{mine['id']}/assign", headers=two["b_disp"], json={"courier_id": a_courier.id})
    assert r.status_code == 422 and "Unknown" in r.json()["detail"]                                  # looks exactly like a missing courier
    assert client.post("/orders", headers=two["b_disp"], json={"client_key": "acme-order-2", "pickup_address": "p", "delivery_address": "d", "courier_id": a_courier.id}).status_code == 422
    z = client.post("/zones", headers=two["b_owner"], json={"name": "B zone", "polygon": [[44, 41], [45, 41], [44.5, 42]]}).json()
    assert client.put(f"/zones/{z['id']}/couriers", headers=two["b_owner"], json={"courier_ids": [a_courier.id]}).status_code == 422
    # a GPS fix for another company's courier is rejected as unknown, never stored
    now = datetime.now(timezone.utc).isoformat()
    cour_b = client.post("/fleet/couriers", headers=two["b_owner"], json={"first_name": "Bee", "transport": "scooter"}).json()
    ev = {"courier_id": a_courier.id, "lat": 41.7, "lon": 44.8, "recorded_at": now, "source": "gps_device", "accuracy_m": 5}
    r = client.post("/fleet/locations", headers=two["b_owner"], json={"events": [ev]})
    assert r.json()["results"][0] == {"index": 0, "status": "rejected", "reason": "unknown_courier"}
    assert db.query(Courier).filter_by(id=cour_b["id"]).one().tenant_id == b


def test_same_external_id_and_names_can_exist_in_both_companies(client, db, two):
    payload = {"source_system": "erp", "external_id": "SO-1", "delivery_address": "x", "delivery_lat": 41.7, "delivery_lon": 44.8}
    ha = login(client, "api_service@z.local")
    make_user(db, "api@acme.test", "api_service", two["b"])
    hb = login(client, "api@acme.test")
    assert client.post("/orders/sync", json=payload, headers=ha).status_code == 201
    assert client.post("/orders/sync", json=payload, headers=hb).status_code == 201      # not a duplicate: different company
    assert client.post("/orders/sync", json=payload, headers=hb).status_code == 200      # a replay inside B still is
    zname = db.query(Zone).filter_by(tenant_id=two["a"]).first().name
    assert client.post("/zones", headers=two["b_owner"], json={"name": zname, "polygon": [[44, 41], [45, 41], [44.5, 42]]}).status_code == 201


def test_settings_are_per_company(client, two):
    client.put("/settings/payment", headers=two["b_owner"], json={"currency": "USD", "base_rate": 9, "per_km_rate": 1})
    assert client.get("/settings", headers=two["b_owner"]).json()["payment"]["currency"] == "USD"
    a = client.get("/settings", headers=login(client, "operations_manager@z.local")).json()["payment"]
    assert a["currency"] == "GEL" and a["base_rate"] == 3.0


def test_public_links_belong_to_their_company_and_brand(client, db, two):
    o = _a_order(client, two)
    tok = client.post(f"/orders/{o['id']}/links", headers=two["a_disp"]).json()["token"]
    pub = client.get(f"/public/track/{tok}").json()
    assert pub["company"] == "Zoommer" and pub["brand_color"] == "#F26A1B"
    assert "delivery_address" in pub and "customer_phone" not in str(pub)
    # company B cannot see or revoke A's link, and its own pin links are invisible to A
    assert client.delete(f"/orders/links/{tok}", headers=two["b_owner"]).status_code == 404
    assert client.get(f"/public/track/{tok}").status_code == 200
    pin = client.post("/pins", headers=two["b_owner"]).json()
    assert client.get(f"/pins/{pin['id']}", headers=two["a_disp"]).status_code == 404
    assert client.get(f"/public/pin/{pin['token']}").json()["company"] == "Acme Delivery"
    # a tracking link whose order id is tampered to another company's order is invalid
    row = db.query(PublicLink).filter_by(token=tok).one()
    row.tenant_id = two["b"]; db.commit()
    assert client.get(f"/public/track/{tok}").status_code == 404


def test_company_switching_requires_membership(client, db, two):
    u = make_user(db, "both@x.test", "dispatcher", two["a"])
    make_user(db, "both@x.test", "analyst", two["b"])
    r = client.post("/auth/login", json={"email": "both@x.test", "password": "pw"}).json()
    assert r["tenant_id"] is None and {c["tenant_id"] for c in r["companies"]} == {two["a"], two["b"]}   # must choose
    h0 = {"Authorization": f"Bearer {r['access_token']}"}
    assert client.get("/orders", headers=h0).status_code == 403                                           # no company selected yet
    ha = {"Authorization": "Bearer " + client.post("/auth/switch", json={"tenant_id": two["a"]}, headers=h0).json()["access_token"]}
    hb = {"Authorization": "Bearer " + client.post("/auth/switch", json={"tenant_id": two["b"]}, headers=h0).json()["access_token"]}
    assert client.get("/auth/me", headers=ha).json()["role"] == "dispatcher" and client.get("/auth/me", headers=hb).json()["role"] == "analyst"
    assert len(client.get("/orders", headers=ha).json()) > 0 and client.get("/orders", headers=hb).json() == []
    assert client.post("/orders", headers=hb, json={"client_key": "an-analyst-1", "pickup_address": "p", "delivery_address": "d"}).status_code == 403  # analyst: read-only here
    solo = login(client, "owner@acme.test")
    assert client.post("/auth/switch", json={"tenant_id": two["a"]}, headers=solo).status_code == 404    # not a member -> same as unknown
    assert client.post("/auth/switch", json={"tenant_id": 9999}, headers=solo).status_code == 404


def test_removed_member_loses_access_immediately(client, db, two):
    h = two["b_disp"]
    assert client.get("/orders", headers=h).status_code == 200
    m = db.query(Membership).join(User, User.id == Membership.user_id).filter(User.email == "disp@acme.test").one()
    m.is_active = False; db.commit()
    assert client.get("/orders", headers=h).status_code == 401           # same token, but the membership is gone
    assert client.post("/auth/login", json={"email": "disp@acme.test", "password": "pw"}).status_code == 401


def test_branch_operator_sees_only_own_branches(client, db, two):
    a = two["a"]
    b1 = Branch(tenant_id=a, name="BO-1"); b2 = Branch(tenant_id=a, name="BO-2"); db.add_all([b1, b2]); db.commit()
    make_user(db, "bo@zmail.com", "branch_operator", a, branch_ids=[b1.id])
    h = login(client, "bo@zmail.com")
    mk = lambda key, br: client.post("/orders", headers=login(client, "dispatcher@z.local"), json={"client_key": key, "pickup_address": "p", "delivery_address": "d", "branch_id": br}).json()
    o1, o2 = mk("branch-op-1", b1.id), mk("branch-op-2", b2.id)
    ids = {o["id"] for o in client.get("/orders", headers=h).json()}
    assert o1["id"] in ids and o2["id"] not in ids and len(ids) == 1
    assert client.get(f"/orders/{o2['id']}", headers=h).status_code == 404
    assert client.post(f"/orders/{o2['id']}/status", headers=h, json={"status": "cancelled"}).status_code == 404
    mine = client.post("/orders", headers=h, json={"client_key": "branch-op-3", "pickup_address": "p", "delivery_address": "d", "branch_id": b1.id})
    assert mine.status_code == 201 and mine.json()["branch_id"] == b1.id
    assert client.post("/orders", headers=h, json={"client_key": "branch-op-4", "pickup_address": "p", "delivery_address": "d", "branch_id": b2.id}).status_code == 422
    assert client.post("/orders", headers=h, json={"client_key": "branch-op-5", "pickup_address": "p", "delivery_address": "d"}).status_code == 422
    assert [x["name"] for x in client.get("/branches", headers=h).json()] == ["BO-1"]


def test_owner_rules(client, db, two):
    a = two["a"]
    admin = login(client, "admin@zoommer.local", "adminpass")                  # the seeded owner
    owner_id = client.get("/auth/me", headers=admin).json()["id"]
    r = client.post("/users", headers=admin, json={"email": "adm@zmail.com", "password": "longenough1", "role": "admin"})
    assert r.status_code == 201 and r.json()["must_change_password"] is True
    adm = login(client, "adm@zmail.com", "longenough1")
    assert client.post("/users", headers=adm, json={"email": "o2@zmail.com", "password": "longenough1", "role": "owner"}).status_code == 403   # admins cannot grant ownership
    assert client.patch(f"/users/{owner_id}", headers=adm, json={"is_active": False}).status_code == 403                                  # nor touch an owner
    assert client.patch(f"/users/{owner_id}", headers=admin, json={"role": "admin"}).status_code == 409                                    # self + last owner
    o2 = client.post("/users", headers=admin, json={"email": "o2@zmail.com", "password": "longenough1", "role": "owner"}).json()
    o2h = login(client, "o2@zmail.com", "longenough1")
    assert client.patch(f"/users/{owner_id}", headers=o2h, json={"role": "admin"}).status_code == 200      # two owners existed, so one may step down
    assert client.patch(f"/users/{o2['id']}", headers=admin, json={"role": "admin"}).status_code == 403    # the former owner (now admin) cannot touch the last owner
    assert client.patch(f"/users/{o2['id']}", headers=o2h, json={"is_active": False}).status_code == 409   # the last owner cannot deactivate themselves either
    # the same e-mail twice in one company is not a second membership
    assert client.post("/users", headers=admin, json={"email": "ADM@zmail.com", "password": "longenough1", "role": "dispatcher"}).status_code == 409
    # an existing login can be added to another company without touching its password
    r = client.post("/users", headers=two["b_owner"], json={"email": "adm@zmail.com", "role": "analyst"})
    assert r.status_code == 201
    assert client.post("/auth/login", json={"email": "adm@zmail.com", "password": "longenough1"}).status_code == 200
    # temporary password must be replaced before it can be reused: changing it clears the flag
    assert client.patch("/auth/me", headers=adm, json={"current_password": "longenough1", "new_password": "my-own-secret-9"}).status_code == 200
    assert client.get("/auth/me", headers=login(client, "adm@zmail.com", "my-own-secret-9")).json()["must_change_password"] is False


def test_platform_admin_has_no_standing_access_and_support_is_audited(client, db, two):
    from app.models import AuditLog
    make_user(db, "plat@x.test", "analyst", two["a"], platform_admin=True)       # also a member of A, to have a normal login
    db.query(Membership).filter_by(user_id=db.query(User).filter_by(email="plat@x.test").one().id).delete(); db.commit()   # ...then no membership at all
    p = login(client, "plat@x.test")
    assert client.get("/platform/tenants", headers=p).status_code == 200
    assert client.get("/orders", headers=p).status_code == 403                    # platform admin is NOT a company member
    assert client.get("/platform/tenants", headers=two["b_owner"]).status_code == 403
    assert client.post("/platform/tenants/%d/support-access" % two["b"], headers=p, json={"minutes": 15, "reason": "short"}).status_code == 422   # a real reason is required
    r = client.post("/platform/tenants/%d/support-access" % two["b"], headers=p, json={"minutes": 15, "reason": "Investigating ticket #4411"})
    assert r.status_code == 200
    hs = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get("/orders", headers=hs).status_code == 200 and client.get("/auth/me", headers=hs).json()["tenant"]["name"] == "Acme Delivery"
    log = db.query(AuditLog).filter_by(action="support_access", tenant_id=two["b"]).one()
    assert "4411" in log.detail["reason"]                                          # visible in the company's own audit trail
    m = db.query(Membership).filter_by(tenant_id=two["b"], user_id=log.actor_id).one()
    m.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1); db.commit()
    assert client.get("/orders", headers=hs).status_code == 401                    # the grant expired
    assert client.get("/orders", headers=p).status_code == 403


def test_onboarding_creates_first_branch_zone_and_owner(client, db):
    make_user(db, "root@x.test", "analyst", db.query(Tenant).first().id, platform_admin=True)
    db.query(Membership).filter_by(user_id=db.query(User).filter_by(email="root@x.test").one().id).delete(); db.commit()
    p = login(client, "root@x.test")
    body = {"name": "Newco", "slug": "newco", "brand_color": "#0F766E", "logo_text": "nc", "owner_email": "boss@newco.com", "owner_password": "temp-pass-123",
            "first_branch_name": "Newco Hub", "first_branch_lat": 41.7, "first_branch_lon": 44.8}
    t = client.post("/platform/tenants", headers=p, json=body)
    assert t.status_code == 201 and t.json()["logo_text"] == "NC"
    assert client.post("/platform/tenants", headers=p, json=body).status_code == 409
    boss = client.post("/auth/login", json={"email": "boss@newco.com", "password": "temp-pass-123"}).json()
    assert boss["must_change_password"] is True and boss["tenant_id"] == t.json()["id"]
    h = {"Authorization": f"Bearer {boss['access_token']}"}
    assert [b["name"] for b in client.get("/branches", headers=h).json()] == ["Newco Hub"]
    assert [z["name"] for z in client.get("/zones", headers=h).json()] == ["Starter zone"]
    assert client.get("/orders", headers=h).json() == []


def test_zone_priority_decides_overlaps(client, db, two):
    ops = login(client, "operations_manager@z.local")
    sq = lambda d: [[44.0 - d, 41.0 - d], [45.0 + d, 41.0 - d], [45.0 + d, 42.0 + d], [44.0 - d, 42.0 + d]]
    client.post("/zones", headers=ops, json={"name": "Wide", "polygon": sq(1), "priority": 1})
    client.post("/zones", headers=ops, json={"name": "Narrow", "polygon": sq(0), "priority": 5})
    api = login(client, "api_service@z.local")
    r = client.post("/orders/sync", headers=api, json={"source_system": "erp", "external_id": "ZP-1", "delivery_address": "x", "delivery_lat": 41.5, "delivery_lon": 44.5})
    assert client.get("/orders?limit=1", headers=ops).json()[0]["zone"] == "Narrow"
    assert [h["name"] for h in client.get("/zones/lookup?lat=41.5&lon=44.5", headers=ops).json()][0] == "Narrow"
