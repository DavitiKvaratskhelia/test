"""Platform administration: companies and plans. Platform admins have NO standing access to company data; to look inside a
company they must open a time-limited, reasoned, audited support session."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...core_security import create_token, hash_password
from ...db import get_db
from ...deps import Principal, require_platform
from ...models import Branch, Membership, Order, Tenant, User, Zone
from ...services import audit

router = APIRouter(prefix="/platform", tags=["platform"])


class TenantIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    slug: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{2,38}$")
    brand_color: str = Field(default="#F26A1B", pattern=r"^#[0-9a-fA-F]{6}$")
    logo_text: str = Field(default="", max_length=3)
    plan: str = Field(default="pilot", max_length=20)
    owner_email: EmailStr
    owner_password: str | None = Field(default=None, min_length=8, max_length=128)
    first_branch_name: str = Field(default="Main branch", max_length=120)
    first_branch_address: str = Field(default="", max_length=300)
    first_branch_lat: float | None = Field(default=None, ge=-90, le=90)
    first_branch_lon: float | None = Field(default=None, ge=-180, le=180)


class TenantPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    is_active: bool | None = None
    plan: str | None = Field(default=None, max_length=20)
    brand_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    logo_text: str | None = Field(default=None, max_length=3)


def _view(db: Session, t: Tenant) -> dict:
    members = db.scalar(select(func.count()).select_from(Membership).where(Membership.tenant_id == t.id, Membership.expires_at.is_(None))) or 0
    orders = db.scalar(select(func.count()).select_from(Order).where(Order.tenant_id == t.id)) or 0
    return {"id": t.id, "slug": t.slug, "name": t.name, "plan": t.plan, "is_active": t.is_active, "brand_color": t.brand_color,
            "logo_text": t.logo_text, "members": members, "orders": orders, "is_simulated": t.is_simulated}


@router.get("/tenants")
def list_tenants(db: Session = Depends(get_db), p: Principal = Depends(require_platform)):
    return [_view(db, t) for t in db.scalars(select(Tenant).order_by(Tenant.id))]


@router.post("/tenants", status_code=201)
def create_tenant(body: TenantIn, db: Session = Depends(get_db), p: Principal = Depends(require_platform)):
    """Onboarding: company + owner login (temporary password, must be changed) + first branch + a starter zone around it."""
    t = Tenant(slug=body.slug, name=body.name, brand_color=body.brand_color, logo_text=body.logo_text.upper(), plan=body.plan)
    db.add(t)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A company with this slug already exists")
    owner = db.scalar(select(User).where(User.email == body.owner_email.lower()))
    if not owner:
        if not body.owner_password:
            raise HTTPException(422, "A temporary password is required for a new owner login")
        owner = User(email=body.owner_email.lower(), password_hash=hash_password(body.owner_password), must_change_password=True)
        db.add(owner)
        db.flush()
    db.add(Membership(user_id=owner.id, tenant_id=t.id, role="owner", granted_by=p.id))
    b = Branch(tenant_id=t.id, name=body.first_branch_name, address=body.first_branch_address, lat=body.first_branch_lat, lon=body.first_branch_lon)
    db.add(b)
    if body.first_branch_lat is not None and body.first_branch_lon is not None:
        la, lo = body.first_branch_lat, body.first_branch_lon
        db.add(Zone(tenant_id=t.id, name="Starter zone", polygon=[[lo - 0.03, la - 0.02], [lo + 0.03, la - 0.02], [lo + 0.03, la + 0.02], [lo - 0.03, la + 0.02]]))
    audit.record(db, actor_id=p.id, tenant_id=t.id, action="create_tenant", entity="tenant", entity_id=t.id, detail={"slug": t.slug})
    db.commit()
    return _view(db, t)


@router.patch("/tenants/{tenant_id}")
def patch_tenant(tenant_id: int, body: TenantPatch, db: Session = Depends(get_db), p: Principal = Depends(require_platform)):
    t = db.get(Tenant, tenant_id)
    if not t:
        raise HTTPException(404, "Company not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(t, k, v.upper() if k == "logo_text" else v)
    audit.record(db, actor_id=p.id, tenant_id=t.id, action="update_tenant", entity="tenant", entity_id=t.id, detail=body.model_dump(exclude_none=True))
    db.commit()
    return _view(db, t)


class SupportIn(BaseModel):
    minutes: int = Field(default=30, ge=5, le=240)
    reason: str = Field(min_length=10, max_length=300)   # a real reason is mandatory and is written to the company's audit log


@router.post("/tenants/{tenant_id}/support-access")
def support_access(tenant_id: int, body: SupportIn, db: Session = Depends(get_db), p: Principal = Depends(require_platform)):
    t = db.get(Tenant, tenant_id)
    if not t or not t.is_active:
        raise HTTPException(404, "Company not found")
    until = datetime.now(timezone.utc) + timedelta(minutes=body.minutes)
    m = db.scalar(select(Membership).where(Membership.user_id == p.id, Membership.tenant_id == t.id))
    if m and m.expires_at is None:
        raise HTTPException(409, "You already have a permanent membership in this company")
    if m:
        m.expires_at, m.is_active, m.role = until, True, "admin"
    else:
        db.add(Membership(user_id=p.id, tenant_id=t.id, role="admin", expires_at=until, granted_by=p.id))
    audit.record(db, actor_id=p.id, tenant_id=t.id, action="support_access", entity="tenant", entity_id=t.id,
                 detail={"minutes": body.minutes, "reason": body.reason, "until": until.isoformat()})
    db.commit()
    return {"access_token": create_token(p.id, t.id), "tenant_id": t.id, "expires_at": until}
