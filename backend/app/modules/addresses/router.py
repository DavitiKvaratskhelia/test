from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ...db import get_db
from ...deps import require
from ...models import SavedAddress, User
from ...services import audit

router = APIRouter(prefix="/addresses", tags=["addresses"])


class AddressIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    address: str = Field(min_length=1, max_length=300)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lon: float | None = Field(default=None, ge=-180, le=180)
    details: str = Field(default="", max_length=300)
    phone: str = Field(default="", max_length=40, pattern=r"^[0-9+()\-\s]*$")


def _view(a: SavedAddress) -> dict:
    return {"id": a.id, "name": a.name, "address": a.address, "lat": a.lat, "lon": a.lon,
            "details": a.details, "phone": a.phone}


@router.get("")
def list_addresses(q: str | None = None, limit: int = Query(12, ge=1, le=100), offset: int = Query(0, ge=0),
                   db: Session = Depends(get_db), _: User = Depends(require("addresses:read"))):
    stmt = select(SavedAddress)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(SavedAddress.name.ilike(like), SavedAddress.address.ilike(like),
                              SavedAddress.phone.ilike(like)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(SavedAddress.name, SavedAddress.id).limit(limit).offset(offset))
    return {"total": total, "items": [_view(a) for a in rows]}


@router.post("", status_code=201)
def create_address(body: AddressIn, db: Session = Depends(get_db), user: User = Depends(require("addresses:write"))):
    a = SavedAddress(**body.model_dump(), created_by=user.id)
    db.add(a)
    db.flush()
    audit.record(db, actor_id=user.id, action="create", entity="saved_address", entity_id=a.id)
    db.commit()
    return _view(a)


@router.put("/{address_id}")
def update_address(address_id: int, body: AddressIn, db: Session = Depends(get_db),
                   user: User = Depends(require("addresses:write"))):
    a = db.get(SavedAddress, address_id)
    if not a:
        raise HTTPException(404, "Address not found")
    for k, v in body.model_dump().items():
        setattr(a, k, v)
    audit.record(db, actor_id=user.id, action="update", entity="saved_address", entity_id=a.id)
    db.commit()
    return _view(a)


@router.delete("/{address_id}", status_code=204)
def delete_address(address_id: int, db: Session = Depends(get_db), user: User = Depends(require("addresses:write"))):
    a = db.get(SavedAddress, address_id)
    if not a:
        raise HTTPException(404, "Address not found")
    db.delete(a)
    audit.record(db, actor_id=user.id, action="delete", entity="saved_address", entity_id=address_id)
    db.commit()
