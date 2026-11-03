from datetime import datetime, timezone

from app.models import Courier, Order, Vehicle
from app.seed_demo import FLEET, seed_demo
from app.services.freshness import classify


def test_seed_is_idempotent_and_flagged(db):
    seed_demo(db); seed_demo(db)
    assert db.query(Courier).count() == len(FLEET)
    assert db.query(Courier).filter(Courier.is_simulated.is_(False)).count() == 0
    assert db.query(Vehicle).filter(Vehicle.is_simulated.is_(False)).count() == 0
    assert db.query(Order).filter(Order.is_simulated.is_(False)).count() == 0
    assert {v.model for v in db.query(Vehicle)} == {"marshrutka", "combo", "prius_v", "scooter"}


def test_seed_covers_all_freshness_classes(db):
    seed_demo(db)
    now = datetime.now(timezone.utc)
    got = {classify(c.last_seen, now)[0].value for c in db.query(Courier)}
    assert got == {"realtime", "delayed", "offline", "unknown"}
