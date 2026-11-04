"""Company members. A "user" is a login; what they may do comes from their Membership in THIS company."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ...core_security import COMPANY_ROLES, hash_password
from ...db import get_db
from ...deps import Principal, require
from ...models import Branch, Membership, User
from ...services import audit

router = APIRouter(prefix="/users", tags=["users"])

ROLE_DESCRIPTIONS = {
    "owner": "Owns the company: everything an admin can do, plus ownership and admin management",
    "admin": "Manages branches, members, rules and integrations",
    "dispatcher": "Orders, dispatch and fleet view for the company",
    "operations_manager": "Dispatcher access plus couriers, zones and analytics",
    "finance_manager": "Compensation and analytics",
    "courier": "Own shift, assignments and GPS only",
    "api_service": "Order synchronisation from e-commerce/ERP only",
    "analyst": "Read-only on the data it is given",
    "branch_operator": "Creates and hands out orders of its own branches only",
}


class UserCreate(BaseModel):
    email: EmailStr
    password: str | None = Field(default=None, min_length=8, max_length=128)  # not needed when the person already has a login
    role: str
    full_name: str = Field(default="", max_length=200)
    locale: str = Field(default="en", pattern="^(en|ka)$")
    branch_ids: list[int] = []


class UserUpdate(BaseModel):
    role: str | None = None
    full_name: str | None = Field(default=None, max_length=200)
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)
    locale: str | None = Field(default=None, pattern="^(en|ka)$")
    branch_ids: list[int] | None = None


def _view(u: User, m: Membership) -> dict:
    return {"id": u.id, "email": u.email, "full_name": u.full_name, "role": m.role, "is_active": m.is_active and u.is_active,
            "locale": u.locale, "created_at": u.created_at, "branch_ids": m.branch_ids or [],
            "must_change_password": u.must_change_password, "support_access": m.expires_at is not None}


def _check_role(role: str, actor: Principal) -> None:
    if role not in COMPANY_ROLES:
        raise HTTPException(422, f"Unknown role: {role}")
    if role == "owner" and actor.role_name != "owner":
        raise HTTPException(403, "Only an owner can grant ownership")


def _check_branches(db: Session, ids: list[int], tenant_id: int) -> list[int]:
    ids = sorted(set(ids))
    if ids:
        found = set(db.scalars(select(Branch.id).where(Branch.tenant_id == tenant_id, Branch.id.in_(ids))))
        if found != set(ids):
            raise HTTPException(422, f"Unknown branches: {sorted(set(ids) - found)}")
    return ids


def _active_owners(db: Session, tenant_id: int) -> int:
    return db.scalar(select(func.count()).select_from(Membership).where(Membership.tenant_id == tenant_id, Membership.role == "owner",
                                                                       Membership.is_active, Membership.expires_at.is_(None))) or 0


def _member(db: Session, user_id: int, tenant_id: int) -> tuple[User, Membership]:
    row = db.execute(select(User, Membership).join(Membership, Membership.user_id == User.id)
                     .where(User.id == user_id, Membership.tenant_id == tenant_id)).first()
    if not row:
        raise HTTPException(404, "User not found")   # also what a member of another company gets
    return row


@router.get("/roles")
def roles(actor: Principal = Depends(require("users:manage"))):
    return [{"name": r, "description": ROLE_DESCRIPTIONS[r]} for r in COMPANY_ROLES if r in ROLE_DESCRIPTIONS]


@router.get("")
def list_users(db: Session = Depends(get_db), actor: Principal = Depends(require("users:manage"))):
    rows = db.execute(select(User, Membership).join(Membership, Membership.user_id == User.id)
                      .where(Membership.tenant_id == actor.tenant_id).order_by(User.email)).all()
    return [_view(u, m) for u, m in rows]


@router.post("", status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db), actor: Principal = Depends(require("users:manage"))):
    _check_role(body.role, actor)
    branch_ids = _check_branches(db, body.branch_ids, actor.tenant_id)
    email = body.email.lower()
    user = db.scalar(select(User).where(User.email == email))
    if user and db.scalar(select(Membership.id).where(Membership.user_id == user.id, Membership.tenant_id == actor.tenant_id)):
        raise HTTPException(409, "This person is already a member of the company")   # a duplicate never creates a second membership
    if not user:
        if not body.password:
            raise HTTPException(422, "A temporary password is required for a new login")
        user = User(email=email, password_hash=hash_password(body.password), full_name=body.full_name, locale=body.locale,
                    must_change_password=True)   # the person must choose their own password at first sign-in
        db.add(user)
        db.flush()
    m = Membership(user_id=user.id, tenant_id=actor.tenant_id, role=body.role, branch_ids=branch_ids, granted_by=actor.id)
    db.add(m)
    db.flush()
    audit.record(db, actor_id=actor.id, tenant_id=actor.tenant_id, action="create", entity="user", entity_id=user.id, detail={"role": body.role})
    db.commit()
    return _view(user, m)


@router.patch("/{user_id}")
def update_user(user_id: int, body: UserUpdate, db: Session = Depends(get_db), actor: Principal = Depends(require("users:manage"))):
    u, m = _member(db, user_id, actor.tenant_id)
    if m.role == "owner" and actor.role_name != "owner":
        raise HTTPException(403, "Only an owner can change an owner")
    changes: dict = {}
    demoting = body.role is not None and body.role != m.role
    deactivating = body.is_active is False and m.is_active
    if (demoting or deactivating) and u.id == actor.id:
        raise HTTPException(409, "You cannot change your own role or deactivate yourself")
    if m.role == "owner" and (demoting or deactivating) and _active_owners(db, actor.tenant_id) <= 1:
        raise HTTPException(409, "At least one active owner is required")      # the last owner cannot be removed or demoted
    if body.role is not None:
        _check_role(body.role, actor)
        m.role = body.role
        changes["role"] = body.role
    if body.is_active is not None:
        m.is_active = body.is_active
        changes["is_active"] = body.is_active
    if body.branch_ids is not None:
        m.branch_ids = _check_branches(db, body.branch_ids, actor.tenant_id)
    if body.full_name is not None:
        u.full_name = body.full_name
    if body.locale is not None:
        u.locale = body.locale
    if body.password is not None:
        u.password_hash = hash_password(body.password)
        u.must_change_password = True
        changes["password_reset"] = True  # never log the password itself
    audit.record(db, actor_id=actor.id, tenant_id=actor.tenant_id, action="update", entity="user", entity_id=u.id, detail=changes)
    db.commit()
    return _view(u, m)
