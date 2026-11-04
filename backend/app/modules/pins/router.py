import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...db import get_db
from ...deps import Principal, require
from ...models import PublicLink
from ...services import audit

router = APIRouter(prefix="/pins", tags=["pins"])


def _view(p: PublicLink) -> dict:
    exp = p.expires_at if p.expires_at.tzinfo else p.expires_at.replace(tzinfo=timezone.utc)
    done = p.payload.get("lat") is not None
    state = "revoked" if p.revoked_at else "done" if done else "expired" if exp <= datetime.now(timezone.utc) else "pending"
    return {"id": p.id, "token": p.token, "path": f"/pin/{p.token}", "state": state, "lat": p.payload.get("lat"),
            "lon": p.payload.get("lon"), "created_at": p.created_at, "expires_at": p.expires_at}


@router.post("", status_code=201)
def create_pin(db: Session = Depends(get_db), user: Principal = Depends(require("orders:write"))):
    """"Get the Pin": a 24-hour link the operator sends to the customer, who opens it on their phone and drops a pin."""
    p = PublicLink(tenant_id=user.tenant_id, token=secrets.token_urlsafe(24), kind="pin", expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
                   created_by=user.id, payload={})
    db.add(p)
    db.flush()
    audit.record(db, actor_id=user.id, tenant_id=user.tenant_id, action="create_pin_link", entity="public_link", entity_id=p.id)
    db.commit()
    return _view(p)


@router.get("")
def list_pins(limit: int = 20, db: Session = Depends(get_db), user: Principal = Depends(require("orders:read"))):
    rows = db.scalars(select(PublicLink).where(PublicLink.tenant_id == user.tenant_id, PublicLink.kind == "pin").order_by(PublicLink.id.desc()).limit(min(limit, 100)))
    return [_view(p) for p in rows]


@router.get("/{pin_id}")
def get_pin(pin_id: int, db: Session = Depends(get_db), user: Principal = Depends(require("orders:read"))):
    p = db.get(PublicLink, pin_id)
    if not p or p.kind != "pin" or p.tenant_id != user.tenant_id:
        raise HTTPException(404, "Pin not found")
    return _view(p)
