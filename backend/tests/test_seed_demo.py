from datetime import datetime, timezone

from app.models import Courier, Order, SavedAddress, Tenant, Vehicle, Zone, ZoneCourier
from app.seed_demo import DEMO_ADDRESSES, DEMO_ZONES, FLEET, ORDERS, TE_FLEET, seed_demo
from app.services.freshness import classify


def test_seed_is_idempotent_and_flagged(db):
    seed_demo(db); seed_demo(db)
    assert db.query(Courier).count() == len(FLEET) + len(TE_FLEET)
    assert db.query(Courier).filter(Courier.is_simulated.is_(False)).count() == 0
    assert db.query(Vehicle).filter(Vehicle.is_simulated.is_(False)).count() == 0
    assert db.query(Order).filter(Order.is_simulated.is_(False)).count() == 0
    assert {v.model for v in db.query(Vehicle)} == {"marshrutka", "combo", "prius_v", "scooter"}


def test_seed_covers_all_freshness_classes(db):
    seed_demo(db)
    now = datetime.now(timezone.utc)
    got = {classify(c.last_seen, now)[0].value for c in db.query(Courier)}
    assert got == {"realtime", "delayed", "offline", "unknown"}


def test_demo_has_zones_addresses_and_two_isolated_companies(db):
    """Regression: an earlier refactor silently dropped zones and saved addresses from the demo data."""
    seed_demo(db)
    z = db.query(Tenant).filter_by(slug="zoommer").one()
    te = db.query(Tenant).filter_by(slug="tbilisi-express").one()
    assert db.query(Zone).filter_by(tenant_id=z.id).count() == len(DEMO_ZONES)
    assert db.query(SavedAddress).filter_by(tenant_id=z.id).count() == len(DEMO_ADDRESSES)
    assert db.query(ZoneCourier).count() >= 9
    assert db.query(Courier).filter_by(tenant_id=z.id).count() == len(FLEET)
    assert db.query(Order).filter_by(tenant_id=z.id).count() == len(ORDERS)
    assert db.query(Order).filter_by(tenant_id=te.id).count() == 4 and te.brand_color != z.brand_color
    assert db.query(Zone).filter_by(tenant_id=te.id).count() == 2 and db.query(SavedAddress).filter_by(tenant_id=te.id).count() == 2
