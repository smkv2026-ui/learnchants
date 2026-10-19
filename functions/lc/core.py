"""Shared primitives: caller identity, dependency bundle, errors, roles, audit."""

from __future__ import annotations

import logging
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Protocol

from firebase_functions import https_fn
from pydantic import BaseModel, ValidationError

from .config import Config

ROLE_SUPER_ADMIN = "SUPER_ADMIN"
ROLE_ADMIN = "ADMIN"
ROLE_USER = "USER"
ADMIN_ROLES = {ROLE_SUPER_ADMIN, ROLE_ADMIN}

Code = https_fn.FunctionsErrorCode

_log = logging.getLogger("learnchants")


def log(event: str, **fields: Any) -> None:
    """Structured JSON log line. Never pass tokens or PII here."""
    _log.info(json.dumps({"event": event, **fields}, default=str))


def fail(code: Code, message: str, details: Any = None) -> https_fn.HttpsError:
    return https_fn.HttpsError(code, message, details)


@dataclass(frozen=True)
class Caller:
    uid: str
    role: str = ROLE_USER
    email: str | None = None
    name: str | None = None

    @property
    def is_admin(self) -> bool:
        return self.role in ADMIN_ROLES

    @property
    def is_super_admin(self) -> bool:
        return self.role == ROLE_SUPER_ADMIN


def caller_from_auth(auth: Any) -> Caller | None:
    """Build a Caller from ``CallableRequest.auth`` (or None when anonymous)."""
    if auth is None or not getattr(auth, "uid", None):
        return None
    token = getattr(auth, "token", None) or {}
    return Caller(
        uid=auth.uid,
        role=token.get("role") or ROLE_USER,
        email=token.get("email"),
        name=token.get("name"),
    )


def require_auth(caller: Caller | None) -> Caller:
    if caller is None:
        raise fail(Code.UNAUTHENTICATED, "Sign in required.")
    return caller


def require_admin(caller: Caller | None) -> Caller:
    caller = require_auth(caller)
    if not caller.is_admin:
        raise fail(Code.PERMISSION_DENIED, "Admin access required.")
    return caller


def require_super_admin(caller: Caller | None) -> Caller:
    caller = require_auth(caller)
    if not caller.is_super_admin:
        raise fail(Code.PERMISSION_DENIED, "Super Admin access required.")
    return caller


def parse(model: type[BaseModel], data: Any) -> Any:
    try:
        return model.model_validate(data or {})
    except ValidationError as exc:
        first = exc.errors()[0]
        where = ".".join(str(p) for p in first.get("loc", ()))
        raise fail(Code.INVALID_ARGUMENT, f"Invalid request: {where} {first.get('msg', '')}".strip()) from exc


class AuthAdapter(Protocol):
    def get_user(self, uid: str) -> Any: ...
    def get_user_by_email(self, email: str) -> Any: ...
    def set_custom_user_claims(self, uid: str, claims: dict[str, Any] | None) -> None: ...
    def revoke_refresh_tokens(self, uid: str) -> None: ...


@dataclass
class Deps:
    db: Any
    auth: AuthAdapter
    config: Config
    storage_factory: Callable[["Deps", str], Any]
    clock: Callable[[], datetime] = field(default=lambda: datetime.now(timezone.utc))

    def now(self) -> datetime:
        return self.clock()

    def storage(self, owner_uid: str) -> Any:
        """Return the ``StorageProvider`` for the admin who owns the content."""
        return self.storage_factory(self, owner_uid)


def audit(deps: Deps, actor: Caller, action: str, target: dict[str, Any] | None = None, **extra: Any) -> None:
    """Admin-only audit trail. This is the only place admin identity is linked to actions."""
    deps.db.collection("auditLogs").add(
        {
            "actorUid": actor.uid,
            "actorEmail": actor.email,
            "actorRole": actor.role,
            "action": action,
            "target": target or {},
            "extra": extra,
            "createdAt": deps.now(),
        }
    )
    log("audit", action=action, target=target or {})


def notify(deps: Deps, uid: str, type_: str, message: str, link: str | None = None) -> None:
    """Learner notification. Messages must never mention which admin acted."""
    deps.db.collection("users").document(uid).collection("notifications").add(
        {"type": type_, "message": message, "link": link, "read": False, "createdAt": deps.now()}
    )


def fget(snap: Any, key: str, default: Any = None) -> Any:
    """Read a field from a DocumentSnapshot without raising on missing fields/docs."""
    if snap is None or not snap.exists:
        return default
    return (snap.to_dict() or {}).get(key, default)


def day_key(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%d")
