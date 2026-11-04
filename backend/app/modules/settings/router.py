from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from ...db import get_db
from ...deps import Principal, require
from ...models import AppSetting
from ...services import audit

router = APIRouter(prefix="/settings", tags=["settings"])


class AccountSettings(BaseModel):
    company_name: str = Field(default="Zoommer", max_length=100)
    default_locale: str = Field(default="ka", pattern="^(en|ka)$")
    timezone: str = Field(default="Asia/Tbilisi", max_length=60)
    company_email: str = Field(default="", max_length=255, pattern=r"^$|^[^@\s]+@[^@\s]+\.[^@\s]+$")
    company_phone: str = Field(default="", max_length=40, pattern=r"^[0-9+()\-\s]*$")


class DeliverySettings(BaseModel):
    default_service_time_s: int = Field(default=180, ge=30, le=1800)
    max_active_orders_per_courier: int = Field(default=8, ge=1, le=50)
    late_threshold_min: int = Field(default=10, ge=0, le=240)
    auto_dispatch: bool = False  # false = dispatcher approval required


class PaymentSettings(BaseModel):
    currency: str = Field(default="GEL", pattern="^[A-Z]{3}$")
    base_rate: float = Field(default=0, ge=0, le=10000)
    per_km_rate: float = Field(default=0, ge=0, le=1000)


class GeolocationSettings(BaseModel):
    gps_interval_s: int = Field(default=15, ge=5, le=600)
    realtime_max_age_s: int = Field(default=60, ge=5, le=3600)
    delayed_max_age_s: int = Field(default=300, ge=10, le=86400)
    retention_days: int = Field(default=30, ge=1, le=365)

    @model_validator(mode="after")
    def _order(self):
        if self.delayed_max_age_s <= self.realtime_max_age_s:
            raise ValueError("delayed_max_age_s must be greater than realtime_max_age_s")
        return self


SCHEMAS: dict[str, type[BaseModel]] = {
    "account": AccountSettings, "delivery": DeliverySettings, "payment": PaymentSettings,
    "geolocation": GeolocationSettings,
}


def load(db: Session, tenant_id: int, key: str) -> dict:
    row = db.get(AppSetting, (tenant_id, key))
    return SCHEMAS[key](**(row.value if row else {})).model_dump()


@router.get("")
def all_settings(db: Session = Depends(get_db), user: Principal = Depends(require("settings:read"))):
    return {k: load(db, user.tenant_id, k) for k in SCHEMAS}


@router.put("/{key}")
def put_setting(key: str, body: dict, db: Session = Depends(get_db), user: Principal = Depends(require("settings:write"))):
    if key not in SCHEMAS:
        raise HTTPException(404, "Unknown settings group")
    try:
        value = SCHEMAS[key](**body).model_dump()
    except Exception as e:  # pydantic ValidationError -> 422 with readable message
        raise HTTPException(422, str(e))
    row = db.get(AppSetting, (user.tenant_id, key))
    if row:
        row.value, row.updated_by = value, user.id
    else:
        db.add(AppSetting(tenant_id=user.tenant_id, key=key, value=value, updated_by=user.id))
    audit.record(db, actor_id=user.id, tenant_id=user.tenant_id, action="update", entity="settings", entity_id=key, detail=value)
    db.commit()
    return value
