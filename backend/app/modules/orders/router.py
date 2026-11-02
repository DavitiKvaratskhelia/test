from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...db import get_db
from ...deps import require
from ...models import IntegrationEvent, Order, OrderStop, User
from ...services import audit

router = APIRouter(prefix="/orders", tags=["orders"])

# allowed status transitions
TRANSITIONS = {
    "new": {"ready", "cancelled"}, "ready": {"assigned", "cancelled"},
    "assigned": {"picked_up", "ready", "cancelled"}, "picked_up": {"delivered", "failed"},
    "failed": {"returned", "ready"}, "delivered": {"returned"}, "returned": set(), "cancelled": set(),
}


class OrderIn(BaseModel):
    source_system: str = Field(min_length=1, max_length=40)
    external_id: str = Field(min_length=1, max_length=100)
    customer_name: str = ""
    customer_phone: str = ""
    pickup_branch: str = ""
    pickup_address: str = ""
    pickup_lat: float | None = Field(default=None, ge=-90, le=90)
    pickup_lon: float | None = Field(default=None, ge=-180, le=180)
    delivery_address: str
    delivery_lat: float | None = Field(default=None, ge=-90, le=90)
    delivery_lon: float | None = Field(default=None, ge=-180, le=180)
    weight_kg: float = Field(default=0, ge=0)
    volume_l: float = Field(default=0, ge=0)
    priority: int = 0
    ready_at: datetime | None = None
    window_start: datetime | None = None
    window_end: datetime | None = None
    zone: str = ""


def _view(o: Order) -> dict:
    return {"id": o.id, "source_system": o.source_system, "external_id": o.external_id, "status": o.status,
            "delivery_address": o.delivery_address, "geocode_status": o.geocode_status, "priority": o.priority,
            "window_end": o.window_end}


def _create(db: Session, body: OrderIn) -> Order:
    d = body.model_dump()
    has_coords = d["delivery_lat"] is not None and d["delivery_lon"] is not None
    o = Order(**d, geocode_status="provided" if has_coords else "pending", payload=body.model_dump(mode="json"))
    o.stops = [OrderStop(kind="pickup", lat=o.pickup_lat, lon=o.pickup_lon),
               OrderStop(kind="delivery", lat=o.delivery_lat, lon=o.delivery_lon)]
    db.add(o)
    return o


@router.post("/sync")
def sync_order(body: OrderIn, response: Response, db: Session = Depends(get_db),
               user: User = Depends(require("orders:sync"))):
    """Idempotent upsert keyed on (source_system, external_id). Replays return 200 with the existing order;
    field updates are applied only while the order is still `new`/`ready` (never mid-delivery)."""
    existing = db.scalar(select(Order).where(Order.source_system == body.source_system,
                                             Order.external_id == body.external_id))
    if existing:
        if existing.status in ("new", "ready"):
            for k in ("customer_name", "customer_phone", "delivery_address", "weight_kg", "volume_l",
                      "window_start", "window_end", "priority"):
                setattr(existing, k, getattr(body, k))
            db.commit()
        return {"created": False, **_view(existing)}
    try:
        o = _create(db, body)
        db.flush()
    except IntegrityError:  # concurrent insert of same key
        db.rollback()
        existing = db.scalar(select(Order).where(Order.source_system == body.source_system,
                                                 Order.external_id == body.external_id))
        return {"created": False, **_view(existing)}
    audit.record(db, actor_id=user.id, action="sync_create", entity="order", entity_id=o.id)
    db.commit()
    response.status_code = 201
    return {"created": True, **_view(o)}


@router.get("")
def list_orders(status: str | None = None, limit: int = 100, db: Session = Depends(get_db),
                _: User = Depends(require("orders:read"))):
    q = select(Order).order_by(Order.id.desc()).limit(min(limit, 500))
    if status:
        q = q.where(Order.status == status)
    return [_view(o) for o in db.scalars(q)]


class StatusIn(BaseModel):
    status: str


@router.post("/{order_id}/status")
def change_status(order_id: int, body: StatusIn, db: Session = Depends(get_db),
                  user: User = Depends(require("orders:write"))):
    o = db.get(Order, order_id)
    if not o:
        raise HTTPException(404, "Order not found")
    if body.status not in TRANSITIONS.get(o.status, set()):
        raise HTTPException(409, f"Illegal transition {o.status} -> {body.status}")
    old, o.status = o.status, body.status
    audit.record(db, actor_id=user.id, action="status", entity="order", entity_id=o.id,
                 detail={"from": old, "to": body.status})
    db.commit()
    return _view(o)
