"""Unauthenticated endpoints for customers: order tracking and "Get the Pin". Every response is limited to what that
one person needs — never other recipients' addresses, the courier's phone, or the whole route."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...db import get_db
from ...models import Courier, DeliveryAssignment, Order, OrderStatusEvent, PublicLink
from ...services.freshness import classify
from ..settings.router import load as load_setting

router = APIRouter(prefix="/public", tags=["public"])
NOT_FOUND = HTTPException(404, "This link is not valid any more")  # same answer for unknown / expired / revoked


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _valid_link(db: Session, token: str, kind: str) -> PublicLink:
    link = db.scalar(select(PublicLink).where(PublicLink.token == token, PublicLink.kind == kind))
    if not link or link.revoked_at is not None or _aware(link.expires_at) <= datetime.now(timezone.utc):
        raise NOT_FOUND
    return link


STEPS = ["ready", "assigned", "picked_up", "on_the_way", "delivered"]


@router.get("/track/{token}")
def track(token: str, db: Session = Depends(get_db)):
    link = _valid_link(db, token, "track")
    o = db.get(Order, link.order_id)
    if not o:
        raise NOT_FOUND
    first: dict[str, datetime] = {}
    for e in db.scalars(select(OrderStatusEvent).where(OrderStatusEvent.order_id == o.id).order_by(OrderStatusEvent.id)):
        first.setdefault(e.to_status, e.created_at)
    first.setdefault("ready", first.get("new") or o.created_at)
    courier = db.scalar(select(Courier).join(DeliveryAssignment, DeliveryAssignment.courier_id == Courier.id)
                        .where(DeliveryAssignment.order_id == o.id, DeliveryAssignment.active))
    location = None
    if courier and o.status in ("picked_up", "on_the_way") and courier.last_lat is not None:
        fresh, age = classify(courier.last_seen)
        if fresh.value in ("realtime", "delayed"):   # a stale position is never shown as current
            location = {"lat": courier.last_lat, "lon": courier.last_lon, "age_seconds": round(age or 0)}
    return {
        "company": load_setting(db, "account")["company_name"], "reference": f"#{o.external_id}", "status": o.status,
        "terminal": o.status in ("delivered", "failed", "cancelled", "returned"),
        "steps": [{"key": k, "at": first.get(k)} for k in STEPS],
        "delivery_address": o.delivery_address,
        "courier_first_name": (courier.first_name or courier.full_name.split(" ")[0]) if courier else None,
        "courier_location": location, "updated_at": o.updated_at,
    }


class PinIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


@router.get("/pin/{token}")
def pin_info(token: str, db: Session = Depends(get_db)):
    link = _valid_link(db, token, "pin")
    return {"company": load_setting(db, "account")["company_name"], "expires_at": link.expires_at,
            "submitted": bool(link.payload.get("lat") is not None), "lat": link.payload.get("lat"), "lon": link.payload.get("lon")}


@router.post("/pin/{token}")
def pin_submit(token: str, body: PinIn, db: Session = Depends(get_db)):
    """The customer places (or corrects) their pin. The last submission before expiry wins."""
    link = _valid_link(db, token, "pin")
    n = int(link.payload.get("submissions", 0)) + 1
    link.payload = {"lat": body.lat, "lon": body.lon, "submissions": n}
    link.used_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "submissions": n}
