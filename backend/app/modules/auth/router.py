from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core_security import create_token, verify_password
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
    return {"id": user.id, "email": user.email, "role": user.role.name, "locale": user.locale}
