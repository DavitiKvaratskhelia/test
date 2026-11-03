from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core_security import create_token, hash_password, verify_password
from ...db import get_db
from ...deps import current_user
from ...models import User
from ...services import audit

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str
    password: str


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        audit.record(db, actor_id=None, action="login_failed", entity="user", detail={"email": body.email})
        db.commit()
        raise HTTPException(401, "Invalid credentials")
    audit.record(db, actor_id=user.id, action="login", entity="user", entity_id=user.id)
    db.commit()
    return {"access_token": create_token(user.id, user.role.name), "token_type": "bearer", "role": user.role.name}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return {"id": user.id, "email": user.email, "role": user.role.name, "locale": user.locale, "full_name": user.full_name}


class ProfilePatch(BaseModel):
    full_name: str | None = None
    current_password: str | None = None
    new_password: str | None = None


@router.patch("/me")
def update_me(body: ProfilePatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Own profile only. Changing the password requires the current one."""
    if body.full_name is not None:
        user.full_name = body.full_name.strip()[:200]
    if body.new_password is not None:
        if len(body.new_password) < 8:
            raise HTTPException(422, "Password must be at least 8 characters")
        if not body.current_password or not verify_password(body.current_password, user.password_hash):
            raise HTTPException(403, "Current password is incorrect")
        user.password_hash = hash_password(body.new_password)
    audit.record(db, actor_id=user.id, action="profile_update", entity="user", entity_id=user.id,
                 detail={"password_changed": body.new_password is not None})
    db.commit()
    return {"id": user.id, "email": user.email, "role": user.role.name, "full_name": user.full_name}
