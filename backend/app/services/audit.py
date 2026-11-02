from sqlalchemy.orm import Session

from ..models import AuditLog


def record(db: Session, *, actor_id: int | None, action: str, entity: str,
           entity_id: str | int | None = None, detail: dict | None = None) -> None:
    db.add(AuditLog(actor_id=actor_id, action=action, entity=entity,
                    entity_id=str(entity_id) if entity_id is not None else None, detail=detail or {}))
