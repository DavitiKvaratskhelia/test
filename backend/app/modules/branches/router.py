from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...db import get_db
from ...deps import Principal, require
from ...models import Branch
from ...services import audit
from ...services.tenancy import get_owned

router = APIRouter(prefix="/branches", tags=["branches"])


class BranchIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    city: str = Field(default="Tbilisi", max_length=80)
    address: str = Field(default="", max_length=300)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lon: float | None = Field(default=None, ge=-180, le=180)
    active: bool = True


def _view(b: Branch) -> dict:
    return {"id": b.id, "name": b.name, "city": b.city, "address": b.address, "lat": b.lat, "lon": b.lon, "active": b.active}


@router.get("")
def list_branches(include_inactive: bool = False, db: Session = Depends(get_db), user: Principal = Depends(require("branches:read"))):
    q = select(Branch).where(Branch.tenant_id == user.tenant_id).order_by(Branch.name)
    if not include_inactive:
        q = q.where(Branch.active)
    if user.role_name == "branch_operator" and user.branch_ids:
        q = q.where(Branch.id.in_(user.branch_ids))
    return [_view(b) for b in db.scalars(q)]


@router.post("", status_code=201)
def create_branch(body: BranchIn, db: Session = Depends(get_db), user: Principal = Depends(require("branches:write"))):
    b = Branch(**body.model_dump(), tenant_id=user.tenant_id)
    db.add(b)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A branch with this name already exists")
    audit.record(db, actor_id=user.id, tenant_id=user.tenant_id, action="create", entity="branch", entity_id=b.id)
    db.commit()
    return _view(b)


@router.put("/{branch_id}")
def update_branch(branch_id: int, body: BranchIn, db: Session = Depends(get_db), user: Principal = Depends(require("branches:write"))):
    b = get_owned(db, Branch, branch_id, user, "Branch")
    for k, v in body.model_dump().items():
        setattr(b, k, v)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A branch with this name already exists")
    audit.record(db, actor_id=user.id, tenant_id=user.tenant_id, action="update", entity="branch", entity_id=b.id)
    db.commit()
    return _view(b)
