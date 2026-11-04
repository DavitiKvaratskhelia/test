import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone
from enum import StrEnum

import jwt

from .config import settings


class Role(StrEnum):
    OWNER = "owner"            # company owner: everything an admin can do + ownership of the company
    ADMIN = "admin"
    DISPATCHER = "dispatcher"
    COURIER = "courier"
    FINANCE = "finance_manager"
    OPS = "operations_manager"
    API_SERVICE = "api_service"
    ANALYST = "analyst"                    # read-only on the data it is given
    BRANCH_OPERATOR = "branch_operator"    # creates/hands out orders of its own branches only


# permission -> roles allowed
PERMISSIONS: dict[str, set[Role]] = {
    "fleet:read": {Role.ADMIN, Role.DISPATCHER, Role.OPS, Role.ANALYST, Role.BRANCH_OPERATOR},
    "fleet:manage": {Role.ADMIN, Role.OPS},
    "gps:write": {Role.ADMIN, Role.COURIER, Role.API_SERVICE},
    "orders:read": {Role.ADMIN, Role.DISPATCHER, Role.OPS, Role.FINANCE, Role.ANALYST, Role.BRANCH_OPERATOR},
    "orders:write": {Role.ADMIN, Role.DISPATCHER, Role.OPS, Role.BRANCH_OPERATOR},
    "orders:sync": {Role.ADMIN, Role.API_SERVICE},
    "dispatch": {Role.ADMIN, Role.DISPATCHER, Role.BRANCH_OPERATOR},
    "compensation:read": {Role.ADMIN, Role.FINANCE, Role.OPS},
    "compensation:write": {Role.ADMIN, Role.FINANCE},
    "analytics:read": {Role.ADMIN, Role.FINANCE, Role.OPS, Role.ANALYST},
    "audit:read": {Role.ADMIN},
    "users:manage": {Role.ADMIN},
    "branches:read": {Role.ADMIN, Role.DISPATCHER, Role.OPS, Role.ANALYST, Role.BRANCH_OPERATOR},
    "branches:write": {Role.ADMIN, Role.OPS},
    "addresses:read": {Role.ADMIN, Role.DISPATCHER, Role.OPS, Role.BRANCH_OPERATOR},
    "addresses:write": {Role.ADMIN, Role.DISPATCHER, Role.OPS, Role.BRANCH_OPERATOR},
    "zones:read": {Role.ADMIN, Role.DISPATCHER, Role.OPS, Role.ANALYST, Role.BRANCH_OPERATOR},
    "zones:write": {Role.ADMIN, Role.OPS},
    "settings:read": {Role.ADMIN, Role.DISPATCHER, Role.OPS, Role.FINANCE, Role.ANALYST, Role.BRANCH_OPERATOR},
    "settings:write": {Role.ADMIN, Role.OPS},
}


for _roles in PERMISSIONS.values():  # the owner can do everything an admin can
    if Role.ADMIN in _roles:
        _roles.add(Role.OWNER)

COMPANY_ROLES = tuple(r.value for r in Role)


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


def create_token(user_id: int, tenant_id: int | None = None) -> str:
    """Token = identity + the company the user is currently working in. The role is NOT in the token: it is read from the
    membership on every request, so a demotion or removal takes effect immediately."""
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "tid": tenant_id, "iat": now,
               "exp": now + timedelta(minutes=settings.jwt_ttl_minutes)}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
