from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...db import get_db
from ...deps import require
import uuid

from ...models import Courier, DeliveryAssignment, IntegrationEvent, Order, OrderStop, User, Vehicle, Zone
from ...services.geo import point_in_polygon
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


def _view(o: Order, courier_name: str | None = None) -> dict:
    return {"courier_name": courier_name, "created_at": o.created_at, "id": o.id, "source_system": o.source_system, "external_id": o.external_id, "status": o.status,
            "delivery_address": o.delivery_address, "delivery_lat": o.delivery_lat, "delivery_lon": o.delivery_lon,
            "zone": o.zone, "customer_name": o.customer_name, "pickup_address": o.pickup_address,
            "window_start": o.window_start, "weight_kg": o.weight_kg, "is_simulated": o.is_simulated, "geocode_status": o.geocode_status, "priority": o.priority,
            "window_end": o.window_end}


def _create(db: Session, body: OrderIn) -> Order:
    d = body.model_dump()
    has_coords = d["delivery_lat"] is not None and d["delivery_lon"] is not None
    o = Order(**d, geocode_status="provided" if has_coords else "pending", payload=body.model_dump(mode="json"))
    if has_coords and not o.zone:  # assign the first active zone that contains the delivery point
        for z in db.scalars(select(Zone).where(Zone.active).order_by(Zone.id)):
            if point_in_polygon(o.delivery_lat, o.delivery_lon, z.polygon):
                o.zone = z.name
                break
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
    rows = list(db.scalars(q))
    names = {}
    if rows:  # one query for all active assignments instead of one per order
        names = dict(db.execute(select(DeliveryAssignment.order_id, Courier.full_name)
                                .join(Courier, Courier.id == DeliveryAssignment.courier_id)
                                .where(DeliveryAssignment.active, DeliveryAssignment.order_id.in_([o.id for o in rows]))).all())
    return [_view(o, names.get(o.id)) for o in rows]


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


class ManualOrderIn(BaseModel):
    """Order placed by a dispatcher in the UI (as opposed to /orders/sync from e-commerce/ERP)."""
    client_key: str | None = Field(default=None, min_length=8, max_length=64)  # UI-generated; makes double-submits idempotent
    pickup_branch: str = Field(default="", max_length=80)
    pickup_address: str = Field(min_length=1, max_length=300)
    pickup_lat: float | None = Field(default=None, ge=-90, le=90)
    pickup_lon: float | None = Field(default=None, ge=-180, le=180)
    delivery_address: str = Field(min_length=1, max_length=300)
    delivery_lat: float | None = Field(default=None, ge=-90, le=90)
    delivery_lon: float | None = Field(default=None, ge=-180, le=180)
    delivery_details: str = Field(default="", max_length=300)
    customer_name: str = Field(default="", max_length=200)
    customer_phone: str = Field(default="", max_length=40, pattern=r"^[0-9+()\-\s]*$")
    weight_kg: float = Field(default=0, ge=0, le=5000)
    volume_l: float = Field(default=0, ge=0, le=100000)
    priority: int = Field(default=0, ge=0, le=5)
    courier_id: int | None = None  # None = "choose later"


@router.post("", status_code=201)
def create_order(body: ManualOrderIn, response: Response, db: Session = Depends(get_db),
                 user: User = Depends(require("orders:write"))):
    external_id = f"M-{body.client_key or uuid.uuid4().hex[:10].upper()}"
    existing = db.scalar(select(Order).where(Order.source_system == "dispatcher", Order.external_id == external_id))
    if existing:  # replayed submit
        response.status_code = 200
        return {"created": False, **_view(existing)}
    courier = vehicle = None
    if body.courier_id is not None:
        courier = db.get(Courier, body.courier_id)
        if not courier or not courier.active:
            raise HTTPException(422, "Unknown or inactive courier")
        vehicle = db.get(Vehicle, courier.current_vehicle_id) if courier.current_vehicle_id else None
        # hard constraint: the order must fit the courier's vehicle
        if vehicle and vehicle.capacity_kg and body.weight_kg > vehicle.capacity_kg:
            raise HTTPException(409, f"Order weighs {body.weight_kg:g} kg but {courier.full_name}'s vehicle "
                                     f"carries max {vehicle.capacity_kg:g} kg")
        if vehicle and vehicle.capacity_volume_l and body.volume_l > vehicle.capacity_volume_l:
            raise HTTPException(409, f"Order volume {body.volume_l:g} L exceeds the vehicle capacity "
                                     f"{vehicle.capacity_volume_l:g} L")
    data = OrderIn(source_system="dispatcher", external_id=external_id,
                   **body.model_dump(exclude={"client_key", "courier_id", "delivery_details"}))
    try:
        o = _create(db, data)
        o.status = "assigned" if courier else "ready"
        o.payload = {**o.payload, "delivery_details": body.delivery_details, "created_via": "dispatcher_ui"}
        db.flush()
        if courier:
            db.add(DeliveryAssignment(order_id=o.id, courier_id=courier.id, mode="manual", assigned_by=user.id,
                                      reasoning={"source": "dispatcher_choice"}))
        audit.record(db, actor_id=user.id, action="create", entity="order", entity_id=o.id,
                     detail={"courier_id": body.courier_id})
        db.commit()
    except IntegrityError:  # concurrent double submit with the same client_key
        db.rollback()
        existing = db.scalar(select(Order).where(Order.source_system == "dispatcher", Order.external_id == external_id))
        response.status_code = 200
        return {"created": False, **_view(existing)}
    return {"created": True, **_view(o)}
