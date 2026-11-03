from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ...core_security import Role as R, hash_password
from ...db import get_db
from ...deps import require
from ...models import Role, User
from ...services import audit

router = APIRouter(prefix="/users", tags=["users"])

ROLE_DESCRIPTIONS = {
    "admin": "Full access, including users and settings",
    "dispatcher": "Orders, dispatch and fleet view",
    "operations_manager": "Dispatcher access plus couriers, zones and analytics",
    "finance_manager": "Compensation and analytics",
    "courier": "Own shift, assignments and GPS only",
    "api_service": "Order synchronisation from e-commerce/ERP only",
}


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: str
    full_name: str = Field(default="", max_length=200)
    locale: str = Field(default="en", pattern="^(en|ka)$")


class UserUpdate(BaseModel):
    role: str | None = None
    full_name: str | None = Field(default=None, max_length=200)
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)
    locale: str | None = Field(default=None, pattern="^(en|ka)$")


def _view(u: User) -> dict:
    return {"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role.name,
            "is_active": u.is_active, "locale": u.locale, "created_at": u.created_at}


def _role(db: Session, name: str) -> Role:
    if name not in {r.value for r in R}:
        raise HTTPException(422, f"Unknown role: {name}")
    row = db.scalar(select(Role).where(Role.name == name))
    if not row:
        raise HTTPException(422, f"Role not seeded: {name}")
    return row


def _active_admins(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(User).join(Role).where(Role.name == "admin", User.is_active)) or 0


@router.get("/roles")
def roles(_: User = Depends(require("users:manage"))):
    return [{"name": r.value, "description": ROLE_DESCRIPTIONS[r.value]} for r in R]


@router.get("")
def list_users(db: Session = Depends(get_db), _: User = Depends(require("users:manage"))):
    return [_view(u) for u in db.scalars(select(User).order_by(User.email))]


@router.post("", status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db), actor: User = Depends(require("users:manage"))):
    email = body.email.lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "A user with this email already exists")
    u = User(email=email, password_hash=hash_password(body.password), full_name=body.full_name,
             role_id=_role(db, body.role).id, locale=body.locale)
    db.add(u)
    db.flush()
    audit.record(db, actor_id=actor.id, action="create", entity="user", entity_id=u.id, detail={"role": body.role})
    db.commit()
    db.refresh(u)
    return _view(u)


@router.patch("/{user_id}")
def update_user(user_id: int, body: UserUpdate, db: Session = Depends(get_db),
                actor: User = Depends(require("users:manage"))):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    changes: dict = {}
    demoting = body.role is not None and body.role != "admin" and u.role.name == "admin"
    deactivating = body.is_active is False and u.is_active
    if (demoting or deactivating) and u.role.name == "admin":
        if u.id == actor.id:
            raise HTTPException(409, "You cannot remove your own admin access")
        if _active_admins(db) <= 1:
            raise HTTPException(409, "At least one active admin is required")
    if deactivating and u.id == actor.id:
        raise HTTPException(409, "You cannot deactivate yourself")
    if body.role is not None:
        u.role_id = _role(db, body.role).id
        changes["role"] = body.role
    if body.full_name is not None:
        u.full_name = body.full_name
    if body.is_active is not None:
        u.is_active = body.is_active
        changes["is_active"] = body.is_active
    if body.locale is not None:
        u.locale = body.locale
    if body.password is not None:
        u.password_hash = hash_password(body.password)
        changes["password_reset"] = True  # never log the password itself
    audit.record(db, actor_id=actor.id, action="update", entity="user", entity_id=u.id, detail=changes)
    db.commit()
    db.refresh(u)
    return _view(u)
