from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...db import get_db
from ...deps import Principal, require
from ...services.tenancy import find_owned, get_owned
from ...models import Courier, Zone, ZoneCourier
from ...services import audit
from ...services.geo import point_in_polygon, valid_ring

router = APIRouter(prefix="/zones", tags=["zones"])


class ZoneIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    polygon: list[list[float]]
    color: str = Field(default="#F26A1B", pattern=r"^#[0-9a-fA-F]{6}$")
    active: bool = True
    priority: int = Field(default=0, ge=0, le=100)  # higher wins where zones overlap


class CouriersIn(BaseModel):
    courier_ids: list[int]


def _view(z: Zone, courier_ids: list[int]) -> dict:
    return {"id": z.id, "name": z.name, "polygon": z.polygon, "color": z.color, "active": z.active, "priority": z.priority,
            "courier_ids": courier_ids}


def _ids(db: Session, zone_id: int) -> list[int]:
    return sorted(db.scalars(select(ZoneCourier.courier_id).where(ZoneCourier.zone_id == zone_id)))


@router.get("")
def list_zones(db: Session = Depends(get_db), user: Principal = Depends(require("zones:read"))):
    return [_view(z, _ids(db, z.id)) for z in db.scalars(select(Zone).where(Zone.tenant_id == user.tenant_id).order_by(Zone.name))]


@router.post("", status_code=201)
def create_zone(body: ZoneIn, db: Session = Depends(get_db), user: Principal = Depends(require("zones:write"))):
    if not valid_ring(body.polygon):
        raise HTTPException(422, "polygon must have at least 3 [lon, lat] points within valid ranges")
    z = Zone(**body.model_dump(), tenant_id=user.tenant_id)
    db.add(z)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A zone with this name already exists")
    audit.record(db, actor_id=user.id, tenant_id=user.tenant_id, action="create", entity="zone", entity_id=z.id)
    db.commit()
    return _view(z, [])


@router.put("/{zone_id}")
def update_zone(zone_id: int, body: ZoneIn, db: Session = Depends(get_db), user: Principal = Depends(require("zones:write"))):
    z = get_owned(db, Zone, zone_id, user, "Zone")
    if not valid_ring(body.polygon):
        raise HTTPException(422, "invalid polygon")
    for k, v in body.model_dump().items():
        setattr(z, k, v)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A zone with this name already exists")
    audit.record(db, actor_id=user.id, tenant_id=user.tenant_id, action="update", entity="zone", entity_id=z.id)
    db.commit()
    return _view(z, _ids(db, z.id))


@router.delete("/{zone_id}", status_code=204)
def delete_zone(zone_id: int, db: Session = Depends(get_db), user: Principal = Depends(require("zones:write"))):
    z = get_owned(db, Zone, zone_id, user, "Zone")
    db.execute(delete(ZoneCourier).where(ZoneCourier.zone_id == zone_id))
    db.delete(z)
    audit.record(db, actor_id=user.id, tenant_id=user.tenant_id, action="delete", entity="zone", entity_id=zone_id)
    db.commit()


@router.put("/{zone_id}/couriers")
def set_couriers(zone_id: int, body: CouriersIn, db: Session = Depends(get_db),
                 user: Principal = Depends(require("zones:write"))):
    z = get_owned(db, Zone, zone_id, user, "Zone")
    ids = sorted(set(body.courier_ids))
    found = set(db.scalars(select(Courier.id).where(Courier.tenant_id == user.tenant_id, Courier.id.in_(ids)))) if ids else set()
    if found != set(ids):
        raise HTTPException(422, f"Unknown courier ids: {sorted(set(ids) - found)}")
    db.execute(delete(ZoneCourier).where(ZoneCourier.zone_id == zone_id))
    db.add_all(ZoneCourier(zone_id=zone_id, courier_id=c) for c in ids)
    audit.record(db, actor_id=user.id, tenant_id=user.tenant_id, action="set_couriers", entity="zone", entity_id=zone_id, detail={"couriers": ids})
    db.commit()
    return _view(z, ids)


@router.get("/lookup")
def lookup(lat: float, lon: float, db: Session = Depends(get_db), user: Principal = Depends(require("zones:read"))):
    """Which active zones contain this point."""
    hits = [z for z in db.scalars(select(Zone).where(Zone.tenant_id == user.tenant_id, Zone.active).order_by(Zone.priority.desc(), Zone.id)) if point_in_polygon(lat, lon, z.polygon)]
    return [{"id": z.id, "name": z.name} for z in hits]
