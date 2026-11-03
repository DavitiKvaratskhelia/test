"""Simulated Tbilisi demo data. Everything created here has is_simulated=True and fake phone numbers.
It is NOT live data. Re-running refreshes GPS timestamps (freshness decays with time) without duplicating rows.

Usage: python -m app.seed_demo
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import SessionLocal
from .models import Courier, LocationEvent, Order, OrderStop, Shift, Vehicle

# Capacities/costs are DEMO ASSUMPTIONS, not manufacturer or Zoommer figures.
VEHICLE_CLASSES = {
    "marshrutka": dict(type="car", capacity_kg=1500, capacity_volume_l=9000, cost_per_km=0.55),
    "combo": dict(type="car", capacity_kg=600, capacity_volume_l=3000, cost_per_km=0.32),
    "prius_v": dict(type="car", capacity_kg=300, capacity_volume_l=550, cost_per_km=0.22),
    "scooter": dict(type="scooter", capacity_kg=25, capacity_volume_l=60, cost_per_km=0.08),
}

ZONES = {  # approx district centres (lat, lon)
    "Vake": (41.7090, 44.7700), "Saburtalo": (41.7260, 44.7510), "Vera": (41.7002, 44.7930),
    "Didube": (41.7500, 44.7900), "Isani": (41.6900, 44.8700), "Gldani": (41.7960, 44.8200),
    "Varketili": (41.7100, 44.9500), "Old Tbilisi": (41.6880, 44.8070),
}

# (name, vehicle class, plate, zone, branch, gps age seconds or None=never, shift active, status)
FLEET = [
    ("გიორგი მამულაშვილი", "marshrutka", "DM-101-AA", "Didube", "Demo Hub Didube", 8, True, "busy"),
    ("დავით ბერიძე", "marshrutka", "DM-102-AA", "Isani", "Demo Hub Isani", 140, True, "busy"),
    ("ნიკოლოზ კვარაცხელია", "combo", "DM-201-BB", "Saburtalo", "Demo Hub Saburtalo", 15, True, "busy"),
    ("ლევან გელაშვილი", "combo", "DM-202-BB", "Vake", "Demo Hub Saburtalo", 45, True, "available"),
    ("ზურაბ ჯანელიძე", "combo", "DM-203-BB", "Gldani", "Demo Hub Didube", 900, True, "busy"),
    ("ირაკლი წიქარიშვილი", "prius_v", "DM-301-CC", "Vera", "Demo Hub Saburtalo", 5, True, "busy"),
    ("გოგა ხუციშვილი", "prius_v", "DM-302-CC", "Old Tbilisi", "Demo Hub Isani", 20, True, "available"),
    ("მიხეილ აბაშიძე", "prius_v", "DM-303-CC", "Varketili", "Demo Hub Isani", 200, True, "busy"),
    ("თორნიკე ლომიძე", "prius_v", "DM-304-CC", "Didube", "Demo Hub Didube", None, False, "offline"),
    ("ანდრია სუხიშვილი", "scooter", "DM-401-SC", "Vake", "Demo Hub Saburtalo", 3, True, "busy"),
    ("საბა ნოზაძე", "scooter", "DM-402-SC", "Saburtalo", "Demo Hub Saburtalo", 10, True, "available"),
    ("ლუკა მეტრეველი", "scooter", "DM-403-SC", "Vera", "Demo Hub Saburtalo", 25, True, "busy"),
    ("გიგა ჭავჭავაძე", "scooter", "DM-404-SC", "Old Tbilisi", "Demo Hub Isani", 75, True, "busy"),
    ("ბექა თოფურიძე", "scooter", "DM-405-SC", "Isani", "Demo Hub Isani", 2400, True, "busy"),
    ("დათო ქავთარაძე", "scooter", "DM-406-SC", "Gldani", "Demo Hub Didube", None, False, "offline"),
]

# (customer, zone, address, weight kg, status, priority)
ORDERS = [
    ("DEMO მომხმარებელი 1", "Vake", "დემო მისამართი, ვაკე 12", 2.5, "ready", 0),
    ("DEMO მომხმარებელი 2", "Saburtalo", "დემო მისამართი, საბურთალო 7", 8.0, "ready", 1),
    ("DEMO მომხმარებელი 3", "Vera", "დემო მისამართი, ვერა 3", 1.2, "assigned", 0),
    ("DEMO მომხმარებელი 4", "Isani", "დემო მისამართი, ისანი 21", 45.0, "assigned", 0),   # large appliance
    ("DEMO მომხმარებელი 5", "Gldani", "დემო მისამართი, გლდანი 9", 3.0, "picked_up", 0),
    ("DEMO მომხმარებელი 6", "Didube", "დემო მისამართი, დიდუბე 15", 120.0, "picked_up", 1),  # fridge/washer
    ("DEMO მომხმარებელი 7", "Varketili", "დემო მისამართი, ვარკეთილი 4", 0.6, "new", 0),
    ("DEMO მომხმარებელი 8", "Old Tbilisi", "დემო მისამართი, ძველი თბილისი 2", 5.5, "delivered", 0),
    ("DEMO მომხმარებელი 9", "Vake", "დემო მისამართი, ვაკე 30", 2.0, "failed", 0),
    ("DEMO მომხმარებელი 10", "Saburtalo", "დემო მისამართი, საბურთალო 44", 15.0, "ready", 2),
]


def _jitter(base, i):
    return base[0] + ((i * 37) % 11 - 5) * 0.0011, base[1] + ((i * 53) % 11 - 5) * 0.0013


def seed_demo(db: Session, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    created = 0
    for i, (name, cls, plate, zone, branch, age, on_shift, status) in enumerate(FLEET):
        spec = VEHICLE_CLASSES[cls]
        veh = db.scalar(select(Vehicle).where(Vehicle.plate == plate))
        if not veh:
            veh = Vehicle(plate=plate, model=cls, is_simulated=True, **spec)
            db.add(veh)
            db.flush()
        c = db.scalar(select(Courier).where(Courier.full_name == name, Courier.is_simulated))
        if not c:
            c = Courier(full_name=name, phone=f"+995 555 000 {100 + i:03d}", branch=branch, zone=zone,
                        contract_type="employee" if cls != "scooter" else "contractor", is_simulated=True,
                        tracking_consent_at=now, current_vehicle_id=veh.id)
            db.add(c)
            db.flush()
            created += 1
            if on_shift:
                db.add(Shift(courier_id=c.id, vehicle_id=veh.id, started_at=now - timedelta(hours=3)))
        c.status = status
        if age is None:  # never reported (e.g. off shift)
            c.last_seen = c.last_lat = c.last_lon = c.last_source = None
        else:
            lat, lon = _jitter(ZONES[zone], i)
            ts = now - timedelta(seconds=age)
            c.last_lat, c.last_lon, c.last_seen, c.last_source = lat, lon, ts, "simulated"
            exists = db.scalar(select(LocationEvent.id).where(
                LocationEvent.courier_id == c.id, LocationEvent.recorded_at == ts, LocationEvent.source == "simulated"))
            if not exists:
                # short breadcrumb trail ending at the last fix, for route-history demos
                for k in range(5, -1, -1):
                    db.add(LocationEvent(courier_id=c.id, vehicle_id=veh.id, lat=lat - k * 0.0006, lon=lon - k * 0.0007,
                                         recorded_at=ts - timedelta(seconds=30 * k), source="simulated",
                                         accuracy_m=6.0, speed_ms=0 if k == 0 else 7.5, is_simulated=True))
    for i, (cust, zone, addr, kg, status, prio) in enumerate(ORDERS, start=1):
        ext = f"DEMO-{i:04d}"
        if db.scalar(select(Order.id).where(Order.source_system == "demo", Order.external_id == ext)):
            continue
        lat, lon = _jitter(ZONES[zone], i + 100)
        o = Order(source_system="demo", external_id=ext, customer_name=cust, customer_phone=f"+995 555 999 {i:03d}",
                  pickup_branch="Demo Hub Saburtalo", pickup_address="Demo Hub Saburtalo",
                  pickup_lat=41.7260, pickup_lon=44.7510, delivery_address=addr, delivery_lat=lat, delivery_lon=lon,
                  geocode_status="provided", weight_kg=kg, volume_l=kg * 8, priority=prio, status=status, zone=zone,
                  window_start=now, window_end=now + timedelta(hours=2 + i % 3), is_simulated=True,
                  payload={"simulated": True})
        o.stops = [OrderStop(kind="pickup", lat=41.7260, lon=44.7510), OrderStop(kind="delivery", lat=lat, lon=lon)]
        db.add(o)
    db.commit()
    return {"couriers_created": created, "couriers": len(FLEET), "orders": len(ORDERS)}


if __name__ == "__main__":
    with SessionLocal() as s:
        print(seed_demo(s))
