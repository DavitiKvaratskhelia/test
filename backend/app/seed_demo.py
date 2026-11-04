"""Simulated Tbilisi demo data. Everything created here has is_simulated=True and fake phone numbers.
It is NOT live data. Re-running refreshes GPS timestamps (freshness decays with time) without duplicating rows.

Usage: python -m app.seed_demo
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import SessionLocal
from .services.geo import haversine_m
from .models import (AppSetting, Branch, Courier, DeliveryAssignment, LocationEvent, Order, OrderStatusEvent, OrderStop, SavedAddress,
                     Shift, Tenant, Vehicle, Zone, ZoneCourier)

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
    ("DEMO მომხმარებელი 5", "Gldani", "დემო მისამართი, გლდანი 9", 3.0, "on_the_way", 0),
    ("DEMO მომხმარებელი 6", "Didube", "დემო მისამართი, დიდუბე 15", 120.0, "picked_up", 1),  # fridge/washer
    ("DEMO მომხმარებელი 7", "Varketili", "დემო მისამართი, ვარკეთილი 4", 0.6, "new", 0),
    ("DEMO მომხმარებელი 8", "Old Tbilisi", "დემო მისამართი, ძველი თბილისი 2", 5.5, "delivered", 0),
    ("DEMO მომხმარებელი 9", "Vake", "დემო მისამართი, ვაკე 30", 2.0, "failed", 0),
    ("DEMO მომხმარებელი 10", "Saburtalo", "დემო მისამართი, საბურთალო 44", 15.0, "ready", 2),
]


def _box(lat, lon, dlat=0.014, dlon=0.02):
    """Rough rectangular DEMO zone around a district centre, as a [lon, lat] ring."""
    return [[lon - dlon, lat - dlat], [lon + dlon, lat - dlat], [lon + dlon, lat + dlat], [lon - dlon, lat + dlat]]


DEMO_ZONES = [("Vake", "#F26A1B"), ("Saburtalo", "#2563EB"), ("Gldani", "#16A34A"), ("Varketili", "#9333EA"),
              ("Isani", "#DB2777")]

DEMO_ADDRESSES = [  # simulated places, fake phone numbers
    ("DEMO Hub Saburtalo", "დემო მისამართი, საბურთალო", "Saburtalo", "Entrance 1, floor 2", "+995 555 000 901"),
    ("DEMO Hub Didube", "დემო მისამართი, დიდუბე", "Didube", "Warehouse gate B", "+995 555 000 902"),
    ("DEMO Hub Isani", "დემო მისამართი, ისანი", "Isani", "", "+995 555 000 903"),
    ("DEMO Customer Vake", "დემო მისამართი, ვაკე", "Vake", "Entrance 3, floor 5, apt 21", "+995 555 000 904"),
    ("DEMO Customer Vera", "დემო მისამართი, ვერა", "Vera", "Floor 1", "+995 555 000 905"),
]


ORDER_COURIERS = {  # demo order number -> courier (heavy items go to the marshrutkas)
    3: "ანდრია სუხიშვილი", 4: "დავით ბერიძე", 5: "ლუკა მეტრეველი", 6: "გიორგი მამულაშვილი", 8: "საბა ნოზაძე", 9: "გიგა ჭავჭავაძე",
}


def _jitter(base, i):
    return base[0] + ((i * 37) % 11 - 5) * 0.0011, base[1] + ((i * 53) % 11 - 5) * 0.0013


# ---- second demo company: its own brand, branch, fleet and orders (to prove nothing leaks between companies)
TE_FLEET = [
    ("ნინო ლომთაძე", "scooter", "TE-001-SC", "Vake", "TE Hub", 6, True, "busy"),
    ("მარიამ კიკნაძე", "scooter", "TE-002-SC", "Vera", "TE Hub", 40, True, "available"),
    ("ალექსი ღვინიაშვილი", "combo", "TE-003-CB", "Saburtalo", "TE Hub", 700, True, "busy"),
    ("ტარიელ ბარამიძე", "prius_v", "TE-004-PV", "Old Tbilisi", "TE Hub", None, False, "offline"),
]
TE_ORDERS = [
    ("TE მომხმარებელი 1", "Vake", "TE მისამართი, ვაკე 5", 1.5, "assigned", 0),
    ("TE მომხმარებელი 2", "Vera", "TE მისამართი, ვერა 8", 20.0, "ready", 0),
    ("TE მომხმარებელი 3", "Saburtalo", "TE მისამართი, საბურთალო 3", 4.0, "delivered", 0),
    ("TE მომხმარებელი 4", "Old Tbilisi", "TE მისამართი, ძველი თბილისი 1", 2.0, "ready", 1),
]
TE_COURIERS = {1: "ნინო ლომთაძე", 3: "ალექსი ღვინიაშვილი"}
TE_ZONES = [("TE Vake-Vera", "#0F766E", ["Vake", "Vera"]), ("TE Old Town", "#7C3AED", ["Old Tbilisi"])]
TE_ADDRESSES = [("TE Hub", "TE მისამართი, საბურთალო", "Saburtalo", "", "+995 555 010 001"),
                ("TE Customer Vake", "TE მისამართი, ვაკე", "Vake", "Floor 2", "+995 555 010 002")]

CHAINS = {"new": ["new"], "ready": ["ready"], "assigned": ["ready", "assigned"], "picked_up": ["ready", "assigned", "picked_up"],
          "on_the_way": ["ready", "assigned", "picked_up", "on_the_way"], "delivered": ["ready", "assigned", "picked_up", "on_the_way", "delivered"],
          "failed": ["ready", "assigned", "picked_up", "on_the_way", "failed"]}


def ensure_demo_tenant(db: Session, slug: str, name: str, **kw) -> Tenant:
    t = db.scalar(select(Tenant).where(Tenant.slug == slug))
    if not t:
        t = Tenant(slug=slug, name=name, is_simulated=True, **kw)
        db.add(t)
        db.flush()
    return t


def _seed_company(db: Session, t: Tenant, now: datetime, *, fleet, orders, order_couriers, zones, addresses, branches, prefix: str,
                  hub: tuple[str, float, float]) -> dict:
    created = 0
    branch_ids = {}
    for bname, baddr, bzone in branches:
        b = db.scalar(select(Branch).where(Branch.tenant_id == t.id, Branch.name == bname))
        if not b:
            lat, lon = ZONES[bzone]
            b = Branch(tenant_id=t.id, name=bname, address=baddr, lat=lat + 0.002, lon=lon + 0.002, city="Tbilisi")
            db.add(b)
            db.flush()
        branch_ids[bname] = b.id
    for i, (name, cls, plate, zone, branch, age, on_shift, status) in enumerate(fleet):
        spec = VEHICLE_CLASSES[cls]
        veh = db.scalar(select(Vehicle).where(Vehicle.tenant_id == t.id, Vehicle.plate == plate))
        if not veh:
            veh = Vehicle(tenant_id=t.id, plate=plate, model=cls, is_simulated=True, **spec)
            db.add(veh)
            db.flush()
        c = db.scalar(select(Courier).where(Courier.tenant_id == t.id, Courier.full_name == name, Courier.is_simulated))
        if not c:
            first, _, last = name.partition(" ")
            c = Courier(tenant_id=t.id, full_name=name, first_name=first, last_name=last, email=f"demo.{prefix.lower()}{i + 1}@example.invalid",
                        phone=f"+995 555 {'000' if prefix == 'DEMO' else '010'} {100 + i:03d}", branch=branch, zone=zone,
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
            if not db.scalar(select(LocationEvent.id).where(LocationEvent.courier_id == c.id, LocationEvent.recorded_at == ts, LocationEvent.source == "simulated")):
                for k in range(5, -1, -1):   # short breadcrumb trail ending at the last fix
                    db.add(LocationEvent(courier_id=c.id, vehicle_id=veh.id, lat=lat - k * 0.0006, lon=lon - k * 0.0007,
                                         recorded_at=ts - timedelta(seconds=30 * k), source="simulated", accuracy_m=6.0,
                                         speed_ms=0 if k == 0 else 7.5, is_simulated=True))
    db.flush()
    by_name = {c.full_name: c for c in db.scalars(select(Courier).where(Courier.tenant_id == t.id, Courier.is_simulated))}
    hub_name, hub_lat, hub_lon = hub
    for i, (cust, zone, addr, kg, status, prio) in enumerate(orders, start=1):
        ext = f"{prefix}-{i:04d}"
        if db.scalar(select(Order.id).where(Order.tenant_id == t.id, Order.source_system == "demo", Order.external_id == ext)):
            continue
        lat, lon = _jitter(ZONES[zone], i + 100)
        o = Order(tenant_id=t.id, branch_id=branch_ids.get(hub_name), source_system="demo", external_id=ext, customer_name=cust,
                  customer_phone=f"+995 555 {'999' if prefix == 'DEMO' else '777'} {i:03d}", pickup_branch=hub_name, pickup_address=hub_name,
                  pickup_lat=hub_lat, pickup_lon=hub_lon, delivery_address=addr, delivery_lat=lat, delivery_lon=lon, geocode_status="provided",
                  weight_kg=kg, volume_l=kg * 8, priority=prio, status=status, zone=zone, window_start=now,
                  window_end=now + timedelta(hours=2 + i % 3), is_simulated=True, payload={"simulated": True})
        o.distance_m = round(haversine_m(hub_lat, hub_lon, lat, lon))
        o.stops = [OrderStop(kind="pickup", lat=hub_lat, lon=hub_lon), OrderStop(kind="delivery", lat=lat, lon=lon)]
        db.add(o)
        db.flush()
        t0, prev = now - timedelta(hours=4, minutes=i * 7), None
        for k, st in enumerate(CHAINS[status]):   # status history with real timestamps, ending at the current status
            db.add(OrderStatusEvent(order_id=o.id, from_status=prev, to_status=st, created_at=t0 + timedelta(minutes=25 * k),
                                    reason="simulated delivery failure: recipient unreachable" if st == "failed" else ""))
            prev = st
        o.created_at = t0
        cname = order_couriers.get(i)
        if cname and cname in by_name:
            db.add(DeliveryAssignment(order_id=o.id, courier_id=by_name[cname].id, mode="manual", reasoning={"source": "demo"}))
    if not db.get(AppSetting, (t.id, "payment")):   # demo tariff so the Price column has values (placeholder, not real pricing)
        db.add(AppSetting(tenant_id=t.id, key="payment", value={"currency": "GEL", "base_rate": 3.0, "per_km_rate": 0.6}))
    # zones (+ which couriers work in them) and saved addresses
    by_zone: dict[str, list[int]] = {}
    for c in by_name.values():
        by_zone.setdefault(c.zone, []).append(c.id)
    for zname, color, districts in zones:
        z = db.scalar(select(Zone).where(Zone.tenant_id == t.id, Zone.name == zname))
        if not z:
            lat, lon = ZONES[districts[0]]
            z = Zone(tenant_id=t.id, name=zname, polygon=_box(lat, lon, dlat=0.014 * (1 + 0.5 * (len(districts) - 1)), dlon=0.02 * (1 + 0.5 * (len(districts) - 1))), color=color)
            db.add(z)
            db.flush()
            for d in districts:
                for cid in by_zone.get(d, []):
                    db.add(ZoneCourier(zone_id=z.id, courier_id=cid))
    for i, (nm, addr, zone, details, phone) in enumerate(addresses):
        if not db.scalar(select(SavedAddress.id).where(SavedAddress.tenant_id == t.id, SavedAddress.name == nm)):
            lat, lon = _jitter(ZONES[zone], i + 200)
            db.add(SavedAddress(tenant_id=t.id, name=nm, address=addr, lat=lat, lon=lon, details=details, phone=phone))
    return {"couriers_created": created, "couriers": len(fleet), "orders": len(orders)}


def seed_demo(db: Session, now: datetime | None = None) -> dict:
    """Two simulated companies. Returns the Zoommer summary (kept for callers/tests that predate multi-tenancy)."""
    now = now or datetime.now(timezone.utc)
    zoommer = ensure_demo_tenant(db, "zoommer", "Zoommer", brand_color="#F26A1B", logo_text="Z")
    express = ensure_demo_tenant(db, "tbilisi-express", "Tbilisi Express (DEMO)", brand_color="#0F766E", logo_text="TE")
    zr = _seed_company(db, zoommer, now, fleet=FLEET, orders=ORDERS, order_couriers=ORDER_COURIERS, zones=[(f"DEMO {n}", c, [n]) for n, c in DEMO_ZONES],
                       addresses=DEMO_ADDRESSES, branches=[("Demo Hub Saburtalo", "Demo Hub Saburtalo", "Saburtalo"), ("Demo Hub Didube", "Demo Hub Didube", "Didube"),
                                                           ("Demo Hub Isani", "Demo Hub Isani", "Isani")], prefix="DEMO", hub=("Demo Hub Saburtalo", 41.7260, 44.7510))
    _seed_company(db, express, now, fleet=TE_FLEET, orders=TE_ORDERS, order_couriers=TE_COURIERS, zones=TE_ZONES, addresses=TE_ADDRESSES,
                  branches=[("TE Hub", "TE მისამართი, საბურთალო", "Saburtalo")], prefix="TE", hub=("TE Hub", 41.7270, 44.7520))
    db.commit()
    return zr


if __name__ == "__main__":
    with SessionLocal() as s:
        print(seed_demo(s))
