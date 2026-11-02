import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone
from enum import StrEnum

import jwt

from .config import settings


class Role(StrEnum):
    ADMIN = "admin"
    DISPATCHER = "dispatcher"
    COURIER = "courier"
    FINANCE = "finance_manager"
    OPS = "operations_manager"
    API_SERVICE = "api_service"


# permission -> roles allowed
PERMISSIONS: dict[str, set[Role]] = {
    "fleet:read": {Role.ADMIN, Role.DISPATCHER, Role.OPS},
    "fleet:manage": {Role.ADMIN, Role.OPS},
    "gps:write": {Role.ADMIN, Role.COURIER, Role.API_SERVICE},
    "orders:read": {Role.ADMIN, Role.DISPATCHER, Role.OPS, Role.FINANCE},
    "orders:write": {Role.ADMIN, Role.DISPATCHER, Role.OPS},
    "orders:sync": {Role.ADMIN, Role.API_SERVICE},
    "dispatch": {Role.ADMIN, Role.DISPATCHER},
    "compensation:read": {Role.ADMIN, Role.FINANCE, Role.OPS},
    "compensation:write": {Role.ADMIN, Role.FINANCE},
    "analytics:read": {Role.ADMIN, Role.FINANCE, Role.OPS},
    "audit:read": {Role.ADMIN},
    "users:manage": {Role.ADMIN},
}


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    dk = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt_hex, _ = stored.split("$")
    except ValueError:
        return False
    return hmac.compare_digest(hash_password(password, bytes.fromhex(salt_hex)), stored)


def create_token(user_id: int, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "role": role, "iat": now,
               "exp": now + timedelta(minutes=settings.jwt_ttl_minutes)}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
