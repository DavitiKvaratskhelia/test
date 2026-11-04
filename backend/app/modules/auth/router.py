from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core_security import create_token, hash_password, verify_password
from ...db import get_db
from ...deps import Principal, active_memberships, current_principal
from ...models import Tenant, User
from ...services import audit

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str
    password: str


def _company(db: Session, m) -> dict:
    t = db.get(Tenant, m.tenant_id)
    return {"tenant_id": t.id, "slug": t.slug, "name": t.name, "role": m.role, "brand_color": t.brand_color,
            "logo_text": t.logo_text or t.name[:1].upper(), "is_simulated": t.is_simulated}


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        audit.record(db, actor_id=None, action="login_failed", entity="user", detail={"email": body.email})
        db.commit()
        raise HTTPException(401, "Invalid credentials")
    ms = active_memberships(db, user.id)
    if not ms and not user.is_platform_admin:              # removed from every company: same answer as a wrong password
        raise HTTPException(401, "Invalid credentials")
    tid = ms[0].tenant_id if len(ms) == 1 else None       # several companies: the client asks which one
    audit.record(db, actor_id=user.id, action="login", entity="user", entity_id=user.id, tenant_id=tid)
    db.commit()
    return {"access_token": create_token(user.id, tid), "token_type": "bearer", "tenant_id": tid,
            "companies": [_company(db, m) for m in ms], "is_platform_admin": user.is_platform_admin,
            "must_change_password": user.must_change_password}


class SwitchIn(BaseModel):
    tenant_id: int


@router.post("/switch")
def switch_company(body: SwitchIn, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    """New token for another company the user really belongs to (404 otherwise — no hint whether the company exists)."""
    if not any(m.tenant_id == body.tenant_id for m in active_memberships(db, p.id)):
        raise HTTPException(404, "Company not found")
    audit.record(db, actor_id=p.id, action="switch_company", entity="tenant", entity_id=body.tenant_id, tenant_id=body.tenant_id)
    db.commit()
    return {"access_token": create_token(p.id, body.tenant_id), "token_type": "bearer", "tenant_id": body.tenant_id}


@router.get("/me")
def me(p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    ms = active_memberships(db, p.id)
    current = next((m for m in ms if m.tenant_id == p.tenant_id), None)
    return {"id": p.id, "email": p.email, "role": p.role_name, "locale": p.locale, "full_name": p.full_name,
            "is_platform_admin": p.is_platform_admin, "must_change_password": db.get(User, p.id).must_change_password, "tenant": _company(db, current) if current else None,
            "companies": [_company(db, m) for m in ms], "branch_ids": p.branch_ids}


class ProfilePatch(BaseModel):
    full_name: str | None = None
    current_password: str | None = None
    new_password: str | None = None


@router.patch("/me")
def update_me(body: ProfilePatch, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    """Own profile only. Changing the password requires the current one."""
    user = db.get(User, p.id)
    if body.full_name is not None:
        user.full_name = body.full_name.strip()[:200]
    if body.new_password is not None:
        if len(body.new_password) < 8:
            raise HTTPException(422, "Password must be at least 8 characters")
        if not body.current_password or not verify_password(body.current_password, user.password_hash):
            raise HTTPException(403, "Current password is incorrect")
        user.password_hash = hash_password(body.new_password)
        user.must_change_password = False
    audit.record(db, actor_id=p.id, action="profile_update", entity="user", entity_id=p.id, tenant_id=p.tenant_id,
                 detail={"password_changed": body.new_password is not None})
    db.commit()
    return {"id": p.id, "email": p.email, "role": p.role_name, "full_name": user.full_name}
