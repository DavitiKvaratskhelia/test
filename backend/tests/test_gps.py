from datetime import datetime, timedelta, timezone

from app.models import Courier
from app.services.freshness import Freshness, classify

from .conftest import login

NOW = datetime.now(timezone.utc)


def ev(cid, t=None, **kw):
    d = dict(courier_id=cid, lat=41.7151, lon=44.8271, recorded_at=(t or NOW).isoformat(),
             source="mobile", accuracy_m=8)
    d.update(kw)
    return d


def test_freshness_classes():
    assert classify(None)[0] == Freshness.UNKNOWN
    assert classify(NOW - timedelta(seconds=10))[0] == Freshness.REALTIME
    assert classify(NOW - timedelta(seconds=120))[0] == Freshness.DELAYED
    assert classify(NOW - timedelta(seconds=900))[0] == Freshness.OFFLINE


def test_ingest_and_list(client, courier_ctx):
    cid, h = courier_ctx
    r = client.post("/fleet/locations", json={"events": [ev(cid)]}, headers=h)
    assert r.json()["results"][0]["status"] == "accepted"
    disp = login(client, "dispatcher@z.local")
    c = client.get("/fleet/couriers", headers=disp).json()[0]
    assert c["freshness"] == "realtime" and c["last_location"]["lat"] == 41.7151


def test_gps_disconnection_not_shown_as_current(client, courier_ctx):
    cid, h = courier_ctx
    old = NOW - timedelta(minutes=30)
    client.post("/fleet/locations", json={"events": [ev(cid, old, connectivity="buffered")]}, headers=h)
    disp = login(client, "dispatcher@z.local")
    c = client.get("/fleet/couriers", headers=disp).json()[0]
    assert c["freshness"] == "offline" and c["age_seconds"] > 1500
    assert client.get("/fleet/couriers?freshness=realtime", headers=disp).json() == []


def test_never_reported_is_unknown(client, db, courier_ctx):
    disp = login(client, "dispatcher@z.local")
    assert client.get("/fleet/couriers", headers=disp).json()[0]["freshness"] == "unknown"


def test_duplicate_and_offline_sync_order(client, courier_ctx):
    """Buffered batch arrives out of order and replayed: no duplicates; last_seen reflects newest fix."""
    cid, h = courier_ctx
    t1, t2, t3 = NOW - timedelta(seconds=90), NOW - timedelta(seconds=60), NOW - timedelta(seconds=30)
    batch = [ev(cid, t3, lat=41.72), ev(cid, t1, lat=41.70), ev(cid, t2, lat=41.71)]
    r1 = client.post("/fleet/locations", json={"events": batch}, headers=h).json()["results"]
    assert [x["status"] for x in r1] == ["accepted"] * 3
    r2 = client.post("/fleet/locations", json={"events": batch}, headers=h).json()["results"]
    assert [x["status"] for x in r2] == ["duplicate"] * 3
    disp = login(client, "dispatcher@z.local")
    assert client.get("/fleet/couriers", headers=disp).json()[0]["last_location"]["lat"] == 41.72
    hist = client.get(f"/fleet/couriers/{cid}/history", headers=disp).json()
    assert len(hist) == 3


def test_validation_rejections(client, courier_ctx):
    cid, h = courier_ctx
    bad = [ev(cid, NOW + timedelta(hours=1)), ev(cid, lat=0, lon=0), ev(cid, accuracy_m=5000),
           ev(cid, speed_ms=500), ev(9999)]
    res = client.post("/fleet/locations", json={"events": bad}, headers=h).json()["results"]
    assert [r["reason"] for r in res] == ["timestamp_in_future", "null_island", "accuracy_too_low",
                                          "implausible_speed", "unknown_courier"]


def test_no_consent_no_tracking(client, db):
    c = Courier(full_name="NoConsent"); db.add(c); db.commit()
    admin = login(client, "admin@zoommer.local", "adminpass")
    r = client.post("/fleet/locations", json={"events": [ev(c.id)]}, headers=admin).json()["results"][0]
    assert r["reason"] == "no_tracking_consent"


def test_courier_cannot_post_for_another(client, db, courier_ctx):
    other = Courier(full_name="Other", tracking_consent_at=NOW); db.add(other); db.commit()
    _, h = courier_ctx
    r = client.post("/fleet/locations", json={"events": [ev(other.id)]}, headers=h).json()["results"][0]
    assert r["reason"] == "not_your_courier_id"
