from dataclasses import dataclass
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .core_security import PERMISSIONS, Role, decode_token
from .db import get_db
from .models import Membership, Tenant, User

bearer = HTTPBearer(auto_error=False)


@dataclass
class Principal:
    """Who is calling and in which company. `role` is the role in THAT company (duck-types the old `user.role.name`)."""
    id: int
    email: str
    full_name: str
    locale: str
    is_platform_admin: bool
    tenant_id: int | None
    role_name: str | None
    branch_ids: list[int]

    @property
    def role(self):
        return SimpleNamespace(name=self.role_name or "none")


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def active_memberships(db: Session, user_id: int) -> list[Membership]:
    now = datetime.now(timezone.utc)
    rows = db.scalars(select(Membership).join(Tenant, Tenant.id == Membership.tenant_id)
                      .where(Membership.user_id == user_id, Membership.is_active, Tenant.is_active))
    return [m for m in rows if m.expires_at is None or _aware(m.expires_at) > now]


def current_principal(creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> Principal:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        payload = decode_token(creds.credentials)
        user = db.get(User, int(payload["sub"]))
        tid = payload.get("tid")
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Inactive user")
    memberships = active_memberships(db, user.id)
    if tid is None and len(memberships) == 1:   # convenience: a single company needs no explicit choice
        tid = memberships[0].tenant_id
    m = next((x for x in memberships if x.tenant_id == tid), None) if tid is not None else None
    if tid is not None and m is None:           # token for a company the user no longer belongs to
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No access to this company")
    return Principal(id=user.id, email=user.email, full_name=user.full_name, locale=user.locale,
                     is_platform_admin=user.is_platform_admin, tenant_id=m.tenant_id if m else None,
                     role_name=m.role if m else None, branch_ids=list(m.branch_ids or []) if m else [])


current_user = current_principal  # name kept for routers that only need "the caller"


def require(permission: str):
    """Permission check inside the caller's company. Every tenant-scoped endpoint uses this, so tenant_id is never optional."""
    allowed = PERMISSIONS[permission]

    def dep(p: Principal = Depends(current_principal)) -> Principal:
        if p.tenant_id is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Select a company first")
        if p.role_name not in {r.value for r in allowed}:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Missing permission: {permission}")
        return p
    return dep


def require_platform(p: Principal = Depends(current_principal)) -> Principal:
    if not p.is_platform_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Platform administrators only")
    return p
