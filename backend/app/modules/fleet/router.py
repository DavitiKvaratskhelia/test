from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...config import settings
from ...core_security import Role
from ...db import get_db
from ...deps import current_user, require
from ...models import Courier, LocationEvent, User, Vehicle
from ...services import audit
from ...services.freshness import classify

router = APIRouter(prefix="/fleet", tags=["fleet"])


class VehicleIn(BaseModel):
    plate: str
    type: str = Field(pattern="^(car|scooter|bicycle|foot)$")
    capacity_kg: float = 0
    capacity_volume_l: float = 0
    cost_per_km: float = 0


# Transport kinds shown in the UI -> (vehicle.type used for filters, vehicle.model, default kg, default litres). Defaults are
# demo assumptions, not manufacturer figures; the dispatcher can override capacity per courier.
TRANSPORT = {
    "pedestrian": ("foot", "pedestrian", 10, 20), "bicycle": ("bicycle", "bicycle", 15, 40), "scooter": ("scooter", "scooter", 25, 60),
    "combo": ("car", "combo", 600, 3000), "car": ("car", "car", 300, 550), "truck": ("car", "truck", 1500, 9000),
}
LEGACY_TRANSPORT = {"marshrutka": "truck", "prius_v": "car"}  # models created by the demo seed


def transport_of(v: Vehicle | None) -> str | None:
    if not v:
        return None
    m = v.model or ""
    return LEGACY_TRANSPORT.get(m) or (m if m in TRANSPORT else None)


class CourierIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(default="", max_length=100)
    email: str = Field(default="", max_length=255, pattern=r"^$|^[^@\s]+@[^@\s]+\.[^@\s]+$")
    phone: str = Field(default="", max_length=40, pattern=r"^[0-9+()\-\s]*$")
    transport: str = Field(default="car", pattern="^(pedestrian|bicycle|scooter|combo|car|truck)$")
    capacity_kg: float | None = Field(default=None, ge=0, le=100000)
    capacity_m3: float | None = Field(default=None, ge=0, le=1000)
    contract_type: str = "employee"
    branch: str = ""
    zone: str = ""
    active: bool = True


@router.post("/vehicles", status_code=201)
def create_vehicle(body: VehicleIn, db: Session = Depends(get_db), user: User = Depends(require("fleet:manage"))):
    v = Vehicle(**body.model_dump())
    db.add(v)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Plate already exists")
    audit.record(db, actor_id=user.id, action="create", entity="vehicle", entity_id=v.id)
    db.commit()
    return {"id": v.id, "plate": v.plate, "type": v.type}


def _apply_courier(db: Session, c: Courier, body: CourierIn) -> None:
    c.first_name, c.last_name, c.email, c.phone = body.first_name.strip(), body.last_name.strip(), body.email.strip(), body.phone.strip()
    c.full_name = f"{c.first_name} {c.last_name}".strip()
    c.contract_type, c.branch, c.zone, c.active = body.contract_type, body.branch, body.zone, body.active
    vtype, model, kg, litres = TRANSPORT[body.transport]
    v = db.get(Vehicle, c.current_vehicle_id) if c.current_vehicle_id else None
    if v is None:
        v = Vehicle(plate=None, type=vtype, model=model)
        db.add(v)
    v.type, v.model = vtype, model
    v.capacity_kg = body.capacity_kg if body.capacity_kg is not None else kg
    v.capacity_volume_l = body.capacity_m3 * 1000 if body.capacity_m3 is not None else litres
    db.flush()
    c.current_vehicle_id = v.id


@router.post("/couriers", status_code=201)
def create_courier(body: CourierIn, db: Session = Depends(get_db), user: User = Depends(require("fleet:manage"))):
    c = Courier(full_name=body.first_name)
    db.add(c)
    _apply_courier(db, c, body)
    audit.record(db, actor_id=user.id, action="create", entity="courier", entity_id=c.id)
    db.commit()
    return _courier_view(c, db.get(Vehicle, c.current_vehicle_id))


@router.put("/couriers/{courier_id}")
def update_courier(courier_id: int, body: CourierIn, db: Session = Depends(get_db), user: User = Depends(require("fleet:manage"))):
    c = db.get(Courier, courier_id)
    if not c:
        raise HTTPException(404, "Courier not found")
    _apply_courier(db, c, body)
    audit.record(db, actor_id=user.id, action="update", entity="courier", entity_id=c.id)
    db.commit()
    return _courier_view(c, db.get(Vehicle, c.current_vehicle_id))


@router.post("/couriers/{courier_id}/consent")
def grant_consent(courier_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """A courier grants GPS tracking consent for themselves (admins may record it on their behalf)."""
    c = db.get(Courier, courier_id)
    if not c:
        raise HTTPException(404, "Courier not found")
    if user.role.name != Role.ADMIN and c.user_id != user.id:
        raise HTTPException(403, "Only the courier can grant consent")
    c.tracking_consent_at = datetime.now(timezone.utc)
    audit.record(db, actor_id=user.id, action="gps_consent", entity="courier", entity_id=c.id)
    db.commit()
    return {"consent_at": c.tracking_consent_at}


def _courier_view(c: Courier, v: Vehicle | None = None) -> dict:
    fresh, age = classify(c.last_seen)
    return {
        "id": c.id, "full_name": c.full_name, "status": c.status, "zone": c.zone, "branch": c.branch,
        "first_name": c.first_name, "last_name": c.last_name, "email": c.email, "phone": c.phone, "active": c.active,
        "transport": transport_of(v), "vehicle_type": v.type if v else None, "vehicle_model": v.model if v else None,
        "plate": v.plate if v else None, "is_simulated": c.is_simulated,
        "capacity_kg": v.capacity_kg if v else None, "capacity_volume_l": v.capacity_volume_l if v else None,
        # position is only reported with its age; offline/unknown positions are flagged, not hidden
        "last_location": None if c.last_lat is None else {"lat": c.last_lat, "lon": c.last_lon},
        "last_seen": c.last_seen, "age_seconds": age, "freshness": fresh.value,
        "source": c.last_source,
    }


_last_demo_refresh = 0.0


def _refresh_demo(db: Session) -> None:
    """DEMO_MODE only: re-stamp SIMULATED GPS times so freshness classes stay meaningful over time."""
    global _last_demo_refresh
    import time
    from ...seed_demo import seed_demo
    if time.time() - _last_demo_refresh > 30:
        _last_demo_refresh = time.time()
        seed_demo(db)


@router.get("/couriers")
def list_couriers(freshness: str | None = None, vehicle_type: str | None = None, zone: str | None = None,
                  include_inactive: bool = False, db: Session = Depends(get_db), _: User = Depends(require("fleet:read"))):
    if settings.demo_mode:
        _refresh_demo(db)
    q = select(Courier, Vehicle).outerjoin(Vehicle, Vehicle.id == Courier.current_vehicle_id)
    if not include_inactive:
        q = q.where(Courier.active)
    if vehicle_type:
        q = q.where(Vehicle.type == vehicle_type)
    if zone:
        q = q.where(Courier.zone == zone)
    out = [_courier_view(c, v) for c, v in db.execute(q)]
    return [c for c in out if freshness is None or c["freshness"] == freshness]


class LocationIn(BaseModel):
    courier_id: int
    vehicle_id: int | None = None
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    recorded_at: datetime
    accuracy_m: float | None = Field(default=None, ge=0)
    speed_ms: float | None = Field(default=None, ge=0)
    heading_deg: float | None = Field(default=None, ge=0, le=360)
    source: str = Field(pattern="^(mobile|gps_device)$")
    connectivity: str = Field(default="online", pattern="^(online|buffered)$")


class LocationBatch(BaseModel):
    events: list[LocationIn] = Field(max_length=500)


def _validate(ev: LocationIn, now: datetime) -> str | None:
    ts = ev.recorded_at if ev.recorded_at.tzinfo else ev.recorded_at.replace(tzinfo=timezone.utc)
    if ts > now + timedelta(seconds=settings.gps_max_future_skew_s):
        return "timestamp_in_future"
    if ev.lat == 0 and ev.lon == 0:
        return "null_island"
    if ev.accuracy_m is not None and ev.accuracy_m > settings.gps_max_accuracy_m:
        return "accuracy_too_low"
    if ev.speed_ms is not None and ev.speed_ms > settings.gps_max_speed_ms:
        return "implausible_speed"
    return None


@router.post("/locations")
def ingest_locations(batch: LocationBatch, db: Session = Depends(get_db),
                     user: User = Depends(require("gps:write"))):
    """Idempotent, batch-capable (offline buffers). Returns per-event outcome; never silently drops."""
    now = datetime.now(timezone.utc)
    results, touched = [], {}
    for i, ev in enumerate(batch.events):
        courier = touched.get(ev.courier_id) or db.get(Courier, ev.courier_id)
        if not courier:
            results.append({"index": i, "status": "rejected", "reason": "unknown_courier"})
            continue
        if user.role.name == Role.COURIER and courier.user_id != user.id:
            results.append({"index": i, "status": "rejected", "reason": "not_your_courier_id"})
            continue
        if courier.tracking_consent_at is None:
            results.append({"index": i, "status": "rejected", "reason": "no_tracking_consent"})
            continue
        if (reason := _validate(ev, now)):
            results.append({"index": i, "status": "rejected", "reason": reason})
            continue
        ts = ev.recorded_at if ev.recorded_at.tzinfo else ev.recorded_at.replace(tzinfo=timezone.utc)
        dup = db.scalar(select(LocationEvent.id).where(
            LocationEvent.courier_id == ev.courier_id, LocationEvent.recorded_at == ts,
            LocationEvent.source == ev.source))
        if dup:
            results.append({"index": i, "status": "duplicate"})
            continue
        data = ev.model_dump()
        data["recorded_at"] = ts
        db.add(LocationEvent(**data, received_at=now))
        # only advance "last known" if this fix is newer (buffered backfill must not rewind position)
        last = courier.last_seen
        if last is not None and last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        if last is None or ts > last:
            courier.last_lat, courier.last_lon, courier.last_seen = ev.lat, ev.lon, ts
            courier.last_source = ev.source
        touched[ev.courier_id] = courier
        results.append({"index": i, "status": "accepted"})
    db.commit()
    return {"results": results}


@router.get("/couriers/{courier_id}/history")
def history(courier_id: int, since: datetime | None = None, limit: int = 500, db: Session = Depends(get_db),
            _: User = Depends(require("fleet:read"))):
    q = select(LocationEvent).where(LocationEvent.courier_id == courier_id)
    if since:
        q = q.where(LocationEvent.recorded_at >= since)
    rows = db.scalars(q.order_by(LocationEvent.recorded_at.desc()).limit(min(limit, 2000)))
    return [{"lat": r.lat, "lon": r.lon, "recorded_at": r.recorded_at, "source": r.source,
             "connectivity": r.connectivity} for r in rows]
