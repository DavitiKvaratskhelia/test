"""All persistent entities. Coordinates are stored as lat/lon floats (portable);
PostGIS geography columns + GiST indexes are added by the Postgres migration."""
from datetime import datetime, timezone

from sqlalchemy import (JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, LargeBinary, Numeric, String, Text,
                        UniqueConstraint, CheckConstraint, text)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base

JSONType = JSON().with_variant(JSONB(), "postgresql")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


TS = DateTime(timezone=True)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(TS, default=utcnow, onupdate=utcnow)


# ---------- identity ----------
class Role(Base):
    __tablename__ = "roles"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(40), unique=True)


class User(Base, TimestampMixin):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(200), default="")
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"))
    role: Mapped[Role] = relationship(lazy="joined")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    locale: Mapped[str] = mapped_column(String(5), default="en")  # en | ka


# ---------- fleet ----------
class GpsProvider(Base, TimestampMixin):
    __tablename__ = "gps_providers"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    adapter: Mapped[str] = mapped_column(String(100))  # python adapter key
    mode: Mapped[str] = mapped_column(String(20), default="polling")  # rest|websocket|webhook|polling
    config: Mapped[dict] = mapped_column(JSONType, default=dict)  # non-secret config
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)


class Courier(Base, TimestampMixin):
    __tablename__ = "couriers"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), unique=True)
    full_name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str] = mapped_column(String(40), default="")
    contract_type: Mapped[str] = mapped_column(String(30), default="employee")  # employee|contractor
    branch: Mapped[str] = mapped_column(String(80), default="")
    zone: Mapped[str] = mapped_column(String(80), default="")
    status: Mapped[str] = mapped_column(String(20), default="offline")  # offline|available|busy|break
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    tracking_consent_at: Mapped[datetime | None] = mapped_column(TS)  # privacy: GPS only after consent
    # denormalised last known position (updated by GPS ingest; see freshness)
    last_lat: Mapped[float | None] = mapped_column(Float)
    last_lon: Mapped[float | None] = mapped_column(Float)
    last_seen: Mapped[datetime | None] = mapped_column(TS)
    last_source: Mapped[str | None] = mapped_column(String(30))
    current_vehicle_id: Mapped[int | None] = mapped_column(ForeignKey("vehicles.id", use_alter=True, name="fk_courier_current_vehicle"))


class Vehicle(Base, TimestampMixin):
    __tablename__ = "vehicles"
    id: Mapped[int] = mapped_column(primary_key=True)
    plate: Mapped[str] = mapped_column(String(20), unique=True)
    type: Mapped[str] = mapped_column(String(20))  # car | scooter
    model: Mapped[str] = mapped_column(String(60), default="")  # e.g. marshrutka | combo | prius_v | scooter
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    capacity_kg: Mapped[float] = mapped_column(Float, default=0)
    capacity_volume_l: Mapped[float] = mapped_column(Float, default=0)
    cost_per_km: Mapped[float] = mapped_column(Numeric(10, 4), default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    __table_args__ = (CheckConstraint("type in ('car','scooter')", name="ck_vehicle_type"),)


class GpsDevice(Base, TimestampMixin):
    __tablename__ = "gps_devices"
    id: Mapped[int] = mapped_column(primary_key=True)
    provider_id: Mapped[int] = mapped_column(ForeignKey("gps_providers.id"))
    vehicle_id: Mapped[int | None] = mapped_column(ForeignKey("vehicles.id"))
    external_id: Mapped[str] = mapped_column(String(100))
    last_seen: Mapped[datetime | None] = mapped_column(TS)
    __table_args__ = (UniqueConstraint("provider_id", "external_id"),)


class LocationEvent(Base):
    __tablename__ = "location_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    courier_id: Mapped[int | None] = mapped_column(ForeignKey("couriers.id"))
    vehicle_id: Mapped[int | None] = mapped_column(ForeignKey("vehicles.id"))
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    recorded_at: Mapped[datetime] = mapped_column(TS)  # device time
    received_at: Mapped[datetime] = mapped_column(TS, default=utcnow)  # server time
    accuracy_m: Mapped[float | None] = mapped_column(Float)
    speed_ms: Mapped[float | None] = mapped_column(Float)
    heading_deg: Mapped[float | None] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(30))  # mobile|gps_device|simulated
    connectivity: Mapped[str] = mapped_column(String(20), default="online")  # online|buffered
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    __table_args__ = (
        UniqueConstraint("courier_id", "recorded_at", "source", name="uq_location_dedupe"),
        Index("ix_location_courier_time", "courier_id", "recorded_at"),
        CheckConstraint("lat between -90 and 90 and lon between -180 and 180", name="ck_location_range"),
    )


class Shift(Base):
    __tablename__ = "shifts"
    id: Mapped[int] = mapped_column(primary_key=True)
    courier_id: Mapped[int] = mapped_column(ForeignKey("couriers.id"), index=True)
    vehicle_id: Mapped[int | None] = mapped_column(ForeignKey("vehicles.id"))
    started_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(TS)


# ---------- orders ----------
class Order(Base, TimestampMixin):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    source_system: Mapped[str] = mapped_column(String(40))
    external_id: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20), default="new", index=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    customer_name: Mapped[str] = mapped_column(String(200), default="")
    customer_phone: Mapped[str] = mapped_column(String(40), default="")
    pickup_branch: Mapped[str] = mapped_column(String(80), default="")
    pickup_address: Mapped[str] = mapped_column(String(300), default="")
    pickup_lat: Mapped[float | None] = mapped_column(Float)
    pickup_lon: Mapped[float | None] = mapped_column(Float)
    delivery_address: Mapped[str] = mapped_column(String(300))
    delivery_lat: Mapped[float | None] = mapped_column(Float)
    delivery_lon: Mapped[float | None] = mapped_column(Float)
    geocode_status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|ok|failed|provided
    weight_kg: Mapped[float] = mapped_column(Float, default=0)
    volume_l: Mapped[float] = mapped_column(Float, default=0)
    ready_at: Mapped[datetime | None] = mapped_column(TS)
    window_start: Mapped[datetime | None] = mapped_column(TS)
    window_end: Mapped[datetime | None] = mapped_column(TS)
    zone: Mapped[str] = mapped_column(String(80), default="")
    payload: Mapped[dict] = mapped_column(JSONType, default=dict)
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    stops: Mapped[list["OrderStop"]] = relationship(cascade="all, delete-orphan")
    __table_args__ = (
        UniqueConstraint("source_system", "external_id", name="uq_order_external"),
        CheckConstraint("status in ('new','ready','assigned','picked_up','delivered','failed','returned','cancelled')",
                        name="ck_order_status"),
    )


class OrderStop(Base):
    __tablename__ = "order_stops"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    kind: Mapped[str] = mapped_column(String(10))  # pickup | delivery | return
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    service_time_s: Mapped[int] = mapped_column(Integer, default=180)
    completed_at: Mapped[datetime | None] = mapped_column(TS)
    proof: Mapped[dict] = mapped_column(JSONType, default=dict)  # photo url, signature, otp, failure reason


# ---------- routing ----------
class RouteOptimizationJob(Base):
    __tablename__ = "route_optimization_jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    trigger: Mapped[str] = mapped_column(String(30))  # new_order|delay|traffic|manual
    status: Mapped[str] = mapped_column(String(20), default="queued")  # queued|running|done|failed|timeout
    params: Mapped[dict] = mapped_column(JSONType, default=dict)  # objective weights, time limit
    result_summary: Mapped[dict] = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(TS)


class Route(Base, TimestampMixin):
    __tablename__ = "routes"
    id: Mapped[int] = mapped_column(primary_key=True)
    courier_id: Mapped[int] = mapped_column(ForeignKey("couriers.id"), index=True)
    job_id: Mapped[int | None] = mapped_column(ForeignKey("route_optimization_jobs.id"))
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(20), default="planned")  # planned|active|done|superseded
    planned_distance_m: Mapped[float | None] = mapped_column(Float)
    planned_duration_s: Mapped[float | None] = mapped_column(Float)
    planned_cost: Mapped[float | None] = mapped_column(Numeric(12, 2))


class RouteStop(Base):
    __tablename__ = "route_stops"
    id: Mapped[int] = mapped_column(primary_key=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id"), index=True)
    order_stop_id: Mapped[int] = mapped_column(ForeignKey("order_stops.id"))
    sequence: Mapped[int] = mapped_column(Integer)
    eta: Mapped[datetime | None] = mapped_column(TS)
    locked: Mapped[bool] = mapped_column(Boolean, default=False)  # manual override / in-progress
    __table_args__ = (UniqueConstraint("route_id", "sequence"),)


class DeliveryAssignment(Base):
    __tablename__ = "delivery_assignments"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    courier_id: Mapped[int | None] = mapped_column(ForeignKey("couriers.id"))
    provider_id: Mapped[int | None] = mapped_column(ForeignKey("delivery_providers.id"))
    mode: Mapped[str] = mapped_column(String(10), default="auto")  # auto|manual
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    reasoning: Mapped[dict] = mapped_column(JSONType, default=dict)  # why this option was chosen
    assigned_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    # at most one active assignment per order (partial unique index; works on PG and SQLite)
    __table_args__ = (Index("uq_active_assignment", "order_id", unique=True,
                            postgresql_where=text("active"), sqlite_where=text("active")),)


# ---------- weather ----------
class WeatherObservation(Base):
    __tablename__ = "weather_observations"
    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(40))
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    observed_at: Mapped[datetime] = mapped_column(TS)
    fetched_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    precip_mm_h: Mapped[float | None] = mapped_column(Float)
    kind: Mapped[str] = mapped_column(String(12))  # observed | estimated
    confidence: Mapped[float | None] = mapped_column(Float)
    raw: Mapped[dict] = mapped_column(JSONType, default=dict)
    __table_args__ = (Index("ix_wobs_time", "observed_at"),)


class WeatherForecast(Base):
    __tablename__ = "weather_forecasts"
    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(40))
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    valid_at: Mapped[datetime] = mapped_column(TS)
    issued_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    precip_mm_h: Mapped[float | None] = mapped_column(Float)
    probability: Mapped[float | None] = mapped_column(Float)
    raw: Mapped[dict] = mapped_column(JSONType, default=dict)


# ---------- compensation ----------
class CompensationRule(Base, TimestampMixin):
    __tablename__ = "compensation_rules"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(60))
    version: Mapped[int] = mapped_column(Integer, default=1)
    kind: Mapped[str] = mapped_column(String(20))  # base|weather|distance
    config: Mapped[dict] = mapped_column(JSONType, default=dict)  # thresholds, %, zones, vehicle types, caps
    effective_from: Mapped[datetime] = mapped_column(TS)
    effective_to: Mapped[datetime | None] = mapped_column(TS)
    approval_status: Mapped[str] = mapped_column(String(20), default="draft")  # draft|approved|rejected
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    __table_args__ = (UniqueConstraint("code", "version"),)


class CompensationLedger(Base):
    """Append-only. Corrections are new rows with adjusts_entry_id set."""
    __tablename__ = "compensation_ledger"
    id: Mapped[int] = mapped_column(primary_key=True)
    courier_id: Mapped[int] = mapped_column(ForeignKey("couriers.id"), index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id"))
    rule_id: Mapped[int | None] = mapped_column(ForeignKey("compensation_rules.id"))
    base_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    weather_bonus: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    distance_bonus: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    adjustment: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    final_amount: Mapped[float] = mapped_column(Numeric(12, 2))
    weather_evidence: Mapped[dict] = mapped_column(JSONType, default=dict)  # snapshot of observations used
    approval_status: Mapped[str] = mapped_column(String(20), default="pending")
    adjusts_entry_id: Mapped[int | None] = mapped_column(ForeignKey("compensation_ledger.id"))
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    # no double bonus: one non-adjustment entry per (courier, order)
    __table_args__ = (Index("uq_ledger_order", "courier_id", "order_id", unique=True,
                            postgresql_where=text("adjusts_entry_id is null"),
                            sqlite_where=text("adjusts_entry_id is null")),)


# ---------- external providers ----------
class DeliveryProvider(Base, TimestampMixin):
    __tablename__ = "delivery_providers"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True)  # wolt_drive|glovo|mock
    name: Mapped[str] = mapped_column(String(100))
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    reliability: Mapped[float | None] = mapped_column(Float)


class ProviderQuote(Base):
    __tablename__ = "provider_quotes"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    provider_id: Mapped[int] = mapped_column(ForeignKey("delivery_providers.id"))
    price: Mapped[float | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), default="GEL")
    eta_minutes: Mapped[int | None] = mapped_column(Integer)
    expires_at: Mapped[datetime | None] = mapped_column(TS)
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    raw: Mapped[dict] = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)


class ProviderDelivery(Base, TimestampMixin):
    __tablename__ = "provider_deliveries"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    provider_id: Mapped[int] = mapped_column(ForeignKey("delivery_providers.id"))
    quote_id: Mapped[int | None] = mapped_column(ForeignKey("provider_quotes.id"))
    external_id: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(30), default="created")
    tracking_url: Mapped[str | None] = mapped_column(String(500))
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    __table_args__ = (UniqueConstraint("provider_id", "external_id"),)


class DeliveryCostRecord(Base):
    __tablename__ = "delivery_cost_records"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    courier_id: Mapped[int | None] = mapped_column(ForeignKey("couriers.id"))
    provider_id: Mapped[int | None] = mapped_column(ForeignKey("delivery_providers.id"))
    vehicle_type: Mapped[str | None] = mapped_column(String(20))
    travel_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    compensation_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    late_penalty: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    idle_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    external_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    distance_m: Mapped[float | None] = mapped_column(Float)
    empty_distance_m: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)


# ---------- platform ----------
class IntegrationCredential(Base, TimestampMixin):
    __tablename__ = "integration_credentials"
    id: Mapped[int] = mapped_column(primary_key=True)
    integration: Mapped[str] = mapped_column(String(60), unique=True)
    encrypted_secret: Mapped[bytes] = mapped_column(LargeBinary)  # Fernet token, never plaintext
    meta: Mapped[dict] = mapped_column(JSONType, default=dict)


class IntegrationEvent(Base):
    """Inbound webhook / outbound call log; unique event key gives idempotent processing."""
    __tablename__ = "integration_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(60))
    event_key: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="received")  # received|processed|failed
    payload: Mapped[dict] = mapped_column(JSONType, default=dict)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    __table_args__ = (UniqueConstraint("source", "event_key", name="uq_integration_event"),)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(60))
    entity: Mapped[str] = mapped_column(String(60))
    entity_id: Mapped[str | None] = mapped_column(String(60))
    detail: Mapped[dict] = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow, index=True)


# ---------- dispatcher configuration ----------
class SavedAddress(Base, TimestampMixin):
    """Frequently used pickup/delivery points (branches, warehouses, regular customers)."""
    __tablename__ = "saved_addresses"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str] = mapped_column(String(300))
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    details: Mapped[str] = mapped_column(String(300), default="")  # entrance, floor, apartment
    phone: Mapped[str] = mapped_column(String(40), default="")
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    __table_args__ = (Index("ix_saved_addresses_name", "name"),)


class Zone(Base, TimestampMixin):
    """Operational area drawn by a dispatcher. polygon = GeoJSON-style ring [[lon, lat], ...], not closed."""
    __tablename__ = "zones"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    polygon: Mapped[list] = mapped_column(JSONType)
    color: Mapped[str] = mapped_column(String(9), default="#F26A1B")
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class ZoneCourier(Base):
    __tablename__ = "zone_couriers"
    zone_id: Mapped[int] = mapped_column(ForeignKey("zones.id", ondelete="CASCADE"), primary_key=True)
    courier_id: Mapped[int] = mapped_column(ForeignKey("couriers.id", ondelete="CASCADE"), primary_key=True)


class AppSetting(Base):
    __tablename__ = "app_settings"
    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONType, default=dict)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(TS, default=utcnow, onupdate=utcnow)
