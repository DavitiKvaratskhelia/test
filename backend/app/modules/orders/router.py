import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...db import get_db
from ...deps import Principal, require
from ...models import (Branch, Courier, DeliveryAssignment, Order, OrderStatusEvent, OrderStop, PublicLink, Vehicle, Zone)
from ...services import audit
from ...services.geo import haversine_m, point_in_polygon
from ...services.tenancy import find_owned, get_owned
from ..settings.router import load as load_setting

router = APIRouter(prefix="/orders", tags=["orders"])

# Lifecycle: new(draft) → ready → assigned → picked_up → on_the_way → delivered (+ failed/returned/cancelled).
TRANSITIONS: dict[str, set[str]] = {
    "new": {"ready", "cancelled"},
    "ready": {"assigned", "cancelled"},
    "assigned": {"picked_up", "ready", "cancelled"},
    "picked_up": {"on_the_way", "failed", "cancelled"},
    "on_the_way": {"delivered", "failed"},
    "failed": {"ready", "returned"},
    "delivered": {"returned"},
    "returned": set(), "cancelled": set(),
}
NEEDS_ASSIGNMENT = {"assigned", "picked_up", "on_the_way", "delivered"}
RELEASES_COURIER = {"ready", "cancelled"}  # moving back to these frees the courier's slot


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


def _scope(q, user: Principal):
    """Orders of the caller's company; branch operators additionally only see their own branches."""
    q = q.where(Order.tenant_id == user.tenant_id)
    if user.role_name == "branch_operator" and user.branch_ids:
        q = q.where(Order.branch_id.in_(user.branch_ids))
    return q


def _order_or_404(db: Session, order_id: int, user: Principal) -> Order:
    o = get_owned(db, Order, order_id, user, "Order")
    if user.role_name == "branch_operator" and user.branch_ids and o.branch_id not in user.branch_ids:
        raise HTTPException(404, "Order not found")
    return o


def _price(o: Order, pay: dict) -> float | None:
    """Indicative price from the company's payment parameters; None until a rate is configured."""
    if o.distance_m is None or not (pay["base_rate"] or pay["per_km_rate"]):
        return None
    return round(pay["base_rate"] + pay["per_km_rate"] * o.distance_m / 1000, 2)


def _view(o: Order, courier: dict | None = None, pay: dict | None = None) -> dict:
    courier = courier or {}
    return {
        "id": o.id, "branch_id": o.branch_id, "source_system": o.source_system, "external_id": o.external_id, "status": o.status, "version": o.version,
        "created_at": o.created_at, "updated_at": o.updated_at, "priority": o.priority, "zone": o.zone, "comment": o.comment,
        "customer_name": o.customer_name, "customer_phone": o.customer_phone,
        "pickup_branch": o.pickup_branch, "pickup_address": o.pickup_address, "pickup_lat": o.pickup_lat, "pickup_lon": o.pickup_lon,
        "delivery_address": o.delivery_address, "delivery_lat": o.delivery_lat, "delivery_lon": o.delivery_lon,
        "geocode_status": o.geocode_status, "weight_kg": o.weight_kg, "volume_l": o.volume_l,
        "window_start": o.window_start, "window_end": o.window_end, "is_simulated": o.is_simulated,
        "distance_m": o.distance_m, "distance_is_straight_line": True,
        "price": _price(o, pay) if pay else None, "currency": pay["currency"] if pay else None,
        "courier_id": courier.get("id"), "courier_name": courier.get("name"), "courier_phone": courier.get("phone"),
        "courier_transport": courier.get("transport"),
    }


def _couriers_for(db: Session, order_ids: list[int]) -> dict[int, dict]:
    """Active courier per order, fetched in one query (no N+1)."""
    if not order_ids:
        return {}
    rows = db.execute(
        select(DeliveryAssignment.order_id, Courier.id, Courier.full_name, Courier.phone, Vehicle.model)
        .join(Courier, Courier.id == DeliveryAssignment.courier_id)
        .outerjoin(Vehicle, Vehicle.id == Courier.current_vehicle_id)
        .where(DeliveryAssignment.active, DeliveryAssignment.order_id.in_(order_ids))).all()
    return {oid: {"id": cid, "name": name, "phone": phone, "transport": model} for oid, cid, name, phone, model in rows}


def _event(db: Session, o: Order, to: str, actor, reason: str = "", frm: str | None = "__same__") -> None:
    db.add(OrderStatusEvent(order_id=o.id, from_status=o.status if frm == "__same__" else frm, to_status=to,
                            actor_id=actor.id if actor else None, reason=reason))


def _create(db: Session, body: OrderIn, tenant_id: int, branch_id: int | None = None) -> Order:
    d = body.model_dump()
    has_coords = d["delivery_lat"] is not None and d["delivery_lon"] is not None
    o = Order(**d, tenant_id=tenant_id, branch_id=branch_id, geocode_status="provided" if has_coords else "pending", payload=body.model_dump(mode="json"))
    if has_coords and not o.zone:  # where zones overlap the highest priority wins, then the oldest zone
        for z in db.scalars(select(Zone).where(Zone.tenant_id == tenant_id, Zone.active).order_by(Zone.priority.desc(), Zone.id)):
            if point_in_polygon(o.delivery_lat, o.delivery_lon, z.polygon):
                o.zone = z.name
                break
    if None not in (o.pickup_lat, o.pickup_lon, o.delivery_lat, o.delivery_lon):
        o.distance_m = round(haversine_m(o.pickup_lat, o.pickup_lon, o.delivery_lat, o.delivery_lon))
    o.stops = [OrderStop(kind="pickup", lat=o.pickup_lat, lon=o.pickup_lon),
               OrderStop(kind="delivery", lat=o.delivery_lat, lon=o.delivery_lon)]
    db.add(o)
    return o


def _conflict(o: Order) -> HTTPException:
    return HTTPException(409, f"Order was changed by someone else (now '{o.status}', version {o.version}). Reload and retry.")


def _check_capacity(courier: Courier, vehicle: Vehicle | None, kg: float, litres: float) -> None:
    """Hard constraint: the order must fit the courier's vehicle."""
    if vehicle and vehicle.capacity_kg and kg > vehicle.capacity_kg:
        raise HTTPException(409, f"Order weighs {kg:g} kg but {courier.full_name}'s vehicle carries max {vehicle.capacity_kg:g} kg")
    if vehicle and vehicle.capacity_volume_l and litres > vehicle.capacity_volume_l:
        raise HTTPException(409, f"Order volume {litres:g} L exceeds the vehicle capacity {vehicle.capacity_volume_l:g} L")


@router.post("/sync")
def sync_order(body: OrderIn, response: Response, db: Session = Depends(get_db), user: Principal = Depends(require("orders:sync"))):
    """Idempotent upsert keyed on (source_system, external_id). Replays return 200 with the existing order;
    field updates are applied only while the order is still `new`/`ready` (never mid-delivery)."""
    existing = db.scalar(select(Order).where(Order.tenant_id == user.tenant_id, Order.source_system == body.source_system, Order.external_id == body.external_id))
    if existing:
        if existing.status in ("new", "ready"):
            for k in ("customer_name", "customer_phone", "delivery_address", "weight_kg", "volume_l", "window_start", "window_end", "priority"):
                setattr(existing, k, getattr(body, k))
            existing.version += 1
            db.commit()
        return {"created": False, **_view(existing)}
    try:
        o = _create(db, body, user.tenant_id)
        db.flush()
        db.add(OrderStatusEvent(order_id=o.id, from_status=None, to_status="new", actor_id=user.id, reason="synced"))
    except IntegrityError:  # concurrent insert of same key
        db.rollback()
        existing = db.scalar(select(Order).where(Order.tenant_id == user.tenant_id, Order.source_system == body.source_system, Order.external_id == body.external_id))
        return {"created": False, **_view(existing)}
    audit.record(db, actor_id=user.id, tenant_id=user.tenant_id, action="sync_create", entity="order", entity_id=o.id)
    db.commit()
    response.status_code = 201
    return {"created": True, **_view(o)}


@router.get("")
def list_orders(status: str | None = None, limit: int = 100, db: Session = Depends(get_db), user: Principal = Depends(require("orders:read"))):
    q = _scope(select(Order), user).order_by(Order.id.desc()).limit(min(limit, 500))
    if status:
        q = q.where(Order.status == status)
    rows = list(db.scalars(q))
    couriers, pay = _couriers_for(db, [o.id for o in rows]), load_setting(db, user.tenant_id, "payment")
    return [_view(o, couriers.get(o.id), pay) for o in rows]


@router.get("/{order_id}")
def order_detail(order_id: int, db: Session = Depends(get_db), user: Principal = Depends(require("orders:read"))):
    o = _order_or_404(db, order_id, user)
    events = db.scalars(select(OrderStatusEvent).where(OrderStatusEvent.order_id == o.id).order_by(OrderStatusEvent.id)).all()
    link = db.scalar(select(PublicLink).where(PublicLink.tenant_id == user.tenant_id, PublicLink.order_id == o.id, PublicLink.kind == "track", PublicLink.revoked_at.is_(None)).order_by(PublicLink.id.desc()))
    return {**_view(o, _couriers_for(db, [o.id]).get(o.id), load_setting(db, user.tenant_id, "payment")),
            "events": [{"from": e.from_status, "to": e.to_status, "at": e.created_at, "reason": e.reason} for e in events],
            "allowed_next": sorted(TRANSITIONS.get(o.status, set()) - {"assigned"}),
            "tracking_token": link.token if link and _aware(link.expires_at) > datetime.now(timezone.utc) else None}


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class StatusIn(BaseModel):
    status: str
    reason: str = Field(default="", max_length=300)
    expected_version: int | None = None


@router.post("/{order_id}/status")
def change_status(order_id: int, body: StatusIn, db: Session = Depends(get_db), user: Principal = Depends(require("orders:write"))):
    o = _order_or_404(db, order_id, user)
    if body.expected_version is not None and body.expected_version != o.version:
        raise _conflict(o)
    if body.status not in TRANSITIONS.get(o.status, set()):
        raise HTTPException(409, f"Illegal transition {o.status} -> {body.status}")
    active = db.scalar(select(DeliveryAssignment).where(DeliveryAssignment.order_id == o.id, DeliveryAssignment.active))
    if body.status in NEEDS_ASSIGNMENT and body.status != "assigned" and not active:
        raise HTTPException(409, f"'{body.status}' requires an active courier assignment")
    if body.status == "assigned":
        raise HTTPException(409, "Use the assign action to give the order to a courier")
    if body.status == "failed" and not body.reason.strip():
        raise HTTPException(422, "A failed delivery needs a reason")
    _event(db, o, body.status, user, body.reason)
    if body.status in RELEASES_COURIER or (o.status == "failed" and body.status == "ready"):
        db.execute(update(DeliveryAssignment).where(DeliveryAssignment.order_id == o.id, DeliveryAssignment.active).values(active=False))
    o.status, o.version = body.status, o.version + 1
    audit.record(db, actor_id=user.id, tenant_id=user.tenant_id, action="status", entity="order", entity_id=o.id, detail={"to": body.status, "reason": body.reason})
    db.commit()
    return _view(o, _couriers_for(db, [o.id]).get(o.id), load_setting(db, user.tenant_id, "payment"))


class AssignIn(BaseModel):
    courier_id: int | None = None  # None = unassign
    expected_version: int | None = None


@router.post("/{order_id}/assign")
def assign(order_id: int, body: AssignIn, db: Session = Depends(get_db), user: Principal = Depends(require("dispatch"))):
    o = _order_or_404(db, order_id, user)
    if body.expected_version is not None and body.expected_version != o.version:
        raise _conflict(o)
    if o.status not in ("new", "ready", "assigned"):
        raise HTTPException(409, "The courier can only be changed before pickup (a handover record is needed after pickup)")
    courier = vehicle = None
    if body.courier_id is not None:
        courier = find_owned(db, Courier, body.courier_id, user)
        if not courier or not courier.active:
            raise HTTPException(422, "Unknown or inactive courier")
        vehicle = db.get(Vehicle, courier.current_vehicle_id) if courier.current_vehicle_id else None
        _check_capacity(courier, vehicle, o.weight_kg, o.volume_l)
    try:
        db.execute(update(DeliveryAssignment).where(DeliveryAssignment.order_id == o.id, DeliveryAssignment.active).values(active=False))
        if courier:
            db.add(DeliveryAssignment(order_id=o.id, courier_id=courier.id, mode="manual", assigned_by=user.id, reasoning={"source": "dispatcher_choice"}))
            db.flush()
            _event(db, o, "assigned", user, f"courier: {courier.full_name}", frm=o.status)
            o.status = "assigned"
        elif o.status == "assigned":
            _event(db, o, "ready", user, "unassigned")
            o.status = "ready"
        o.version += 1
        audit.record(db, actor_id=user.id, tenant_id=user.tenant_id, action="assign", entity="order", entity_id=o.id, detail={"courier_id": body.courier_id})
        db.commit()
    except IntegrityError:  # two dispatchers assigned at the same moment: only one wins
        db.rollback()
        raise HTTPException(409, "Someone else assigned this order at the same moment. Reload to see the current courier.")
    return _view(o, _couriers_for(db, [o.id]).get(o.id), load_setting(db, user.tenant_id, "payment"))


class OrderPatch(BaseModel):
    comment: str = Field(max_length=2000)
    expected_version: int | None = None


@router.patch("/{order_id}")
def patch_order(order_id: int, body: OrderPatch, db: Session = Depends(get_db), user: Principal = Depends(require("orders:write"))):
    o = _order_or_404(db, order_id, user)
    if body.expected_version is not None and body.expected_version != o.version:
        raise _conflict(o)
    o.comment, o.version = body.comment, o.version + 1
    audit.record(db, actor_id=user.id, tenant_id=user.tenant_id, action="comment", entity="order", entity_id=o.id)
    db.commit()
    return _view(o, _couriers_for(db, [o.id]).get(o.id), load_setting(db, user.tenant_id, "payment"))


@router.post("/{order_id}/links", status_code=201)
def create_tracking_link(order_id: int, db: Session = Depends(get_db), user: Principal = Depends(require("orders:write"))):
    """Customer tracking link: unguessable token, 30-day expiry, revocable. Reuses a still-valid link."""
    o = _order_or_404(db, order_id, user)
    now = datetime.now(timezone.utc)
    link = db.scalar(select(PublicLink).where(PublicLink.tenant_id == user.tenant_id, PublicLink.order_id == o.id, PublicLink.kind == "track", PublicLink.revoked_at.is_(None)).order_by(PublicLink.id.desc()))
    if not link or _aware(link.expires_at) <= now:
        link = PublicLink(tenant_id=user.tenant_id, token=secrets.token_urlsafe(24), kind="track", order_id=o.id, expires_at=now + timedelta(days=30), created_by=user.id)
        db.add(link)
        audit.record(db, actor_id=user.id, tenant_id=user.tenant_id, action="create_link", entity="order", entity_id=o.id)
        db.commit()
    return {"token": link.token, "path": f"/track/{link.token}", "expires_at": link.expires_at}


@router.delete("/links/{token}", status_code=204)
def revoke_link(token: str, db: Session = Depends(get_db), user: Principal = Depends(require("orders:write"))):
    link = db.scalar(select(PublicLink).where(PublicLink.token == token, PublicLink.tenant_id == user.tenant_id))
    if not link:
        raise HTTPException(404, "Link not found")
    link.revoked_at = datetime.now(timezone.utc)
    audit.record(db, actor_id=user.id, tenant_id=user.tenant_id, action="revoke_link", entity="public_link", entity_id=link.id)
    db.commit()


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
    branch_id: int | None = None   # pickup branch of the company


@router.post("", status_code=201)
def create_order(body: ManualOrderIn, response: Response, db: Session = Depends(get_db), user: Principal = Depends(require("orders:write"))):
    external_id = f"M-{body.client_key or uuid.uuid4().hex[:10].upper()}"
    branch = None
    if body.branch_id is not None:
        branch = find_owned(db, Branch, body.branch_id, user)
        if not branch or not branch.active or (user.role_name == "branch_operator" and user.branch_ids and branch.id not in user.branch_ids):
            raise HTTPException(422, "Unknown branch")
    elif user.role_name == "branch_operator" and user.branch_ids:
        raise HTTPException(422, "Choose one of your branches")
    existing = db.scalar(select(Order).where(Order.tenant_id == user.tenant_id, Order.source_system == "dispatcher", Order.external_id == external_id))
    if existing:  # replayed submit
        response.status_code = 200
        return {"created": False, **_view(existing)}
    courier = vehicle = None
    if body.courier_id is not None:
        courier = find_owned(db, Courier, body.courier_id, user)
        if not courier or not courier.active:
            raise HTTPException(422, "Unknown or inactive courier")
        vehicle = db.get(Vehicle, courier.current_vehicle_id) if courier.current_vehicle_id else None
        _check_capacity(courier, vehicle, body.weight_kg, body.volume_l)
    pickup = body.model_dump(exclude={"client_key", "courier_id", "delivery_details", "branch_id"})
    if branch:
        pickup["pickup_branch"] = branch.name
        if pickup.get("pickup_lat") is None and branch.lat is not None:
            pickup["pickup_lat"], pickup["pickup_lon"] = branch.lat, branch.lon
    data = OrderIn(source_system="dispatcher", external_id=external_id,
                   **pickup)
    try:
        o = _create(db, data, user.tenant_id, branch.id if branch else None)
        o.status = "ready"
        o.payload = {**o.payload, "delivery_details": body.delivery_details, "created_via": "dispatcher_ui"}
        db.flush()
        db.add(OrderStatusEvent(order_id=o.id, from_status=None, to_status="ready", actor_id=user.id, reason="created"))
        if courier:
            db.add(DeliveryAssignment(order_id=o.id, courier_id=courier.id, mode="manual", assigned_by=user.id, reasoning={"source": "dispatcher_choice"}))
            db.add(OrderStatusEvent(order_id=o.id, from_status="ready", to_status="assigned", actor_id=user.id, reason=f"courier: {courier.full_name}"))
            o.status = "assigned"
        audit.record(db, actor_id=user.id, tenant_id=user.tenant_id, action="create", entity="order", entity_id=o.id, detail={"courier_id": body.courier_id})
        db.commit()
    except IntegrityError:  # concurrent double submit with the same client_key
        db.rollback()
        existing = db.scalar(select(Order).where(Order.tenant_id == user.tenant_id, Order.source_system == "dispatcher", Order.external_id == external_id))
        response.status_code = 200
        return {"created": False, **_view(existing)}
    return {"created": True, **_view(o, _couriers_for(db, [o.id]).get(o.id), load_setting(db, user.tenant_id, "payment"))}
