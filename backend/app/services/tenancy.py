"""Tenant guards. Rule: a record is only ever reached together with the caller's tenant_id.
Looking up another company's id answers 404 — identical to a missing record, so ids leak nothing."""
from fastapi import HTTPException
from sqlalchemy.orm import Session


def get_owned(db: Session, model, obj_id, user, label: str = "Record"):
    obj = db.get(model, obj_id) if obj_id is not None else None
    if obj is None or getattr(obj, "tenant_id", None) != user.tenant_id:
        raise HTTPException(404, f"{label} not found")
    return obj


def find_owned(db: Session, model, obj_id, user):
    """Like get_owned but returns None instead of raising (for per-item validation in batches)."""
    obj = db.get(model, obj_id) if obj_id is not None else None
    return obj if obj is not None and getattr(obj, "tenant_id", None) == user.tenant_id else None
