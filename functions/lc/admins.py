"""Admin management: invites, acceptance, deactivation, removal.

Roles live in custom claims which only these functions (and the bootstrap
script) set. ``adminUsers/{uid}`` mirrors admin metadata for the admin portal;
rules make it admin-only.
"""

from __future__ import annotations

import secrets
from datetime import timedelta
from typing import Any

from .core import (
    ROLE_ADMIN,
    ROLE_SUPER_ADMIN,
    ROLE_USER,
    Caller,
    Code,
    Deps,
    audit,
    fail,
    parse,
    require_admin,
    require_auth,
    require_super_admin,
)
from .crypto import sha256_hex
from .models import AcceptInviteReq, CreateInviteReq, DeactivateAdminReq, RemoveAdminReq


def _set_role(deps: Deps, uid: str, role: str, **flags: Any) -> None:
    user = deps.auth.get_user(uid)
    claims = {k: v for k, v in dict(user.custom_claims or {}).items() if k not in {"role", "adminDisabled"}}
    claims["role"] = role
    claims.update({k: v for k, v in flags.items() if v is not None})
    deps.auth.set_custom_user_claims(uid, claims)


def make_super_admin(deps: Deps, uid: str) -> None:
    """Used by ``scripts/bootstrap_super_admin.py``."""
    user = deps.auth.get_user(uid)
    _set_role(deps, uid, ROLE_SUPER_ADMIN)
    deps.db.collection("adminUsers").document(uid).set(
        {
            "email": user.email,
            "displayName": user.display_name or (user.email or "Admin").split("@")[0],
            "role": ROLE_SUPER_ADMIN,
            "status": "active",
            "createdAt": deps.now(),
        },
        merge=True,
    )


def create_admin_invite(deps: Deps, caller: Caller | None, data: Any) -> dict:
    caller = require_admin(caller)
    req = parse(CreateInviteReq, data)
    token = secrets.token_urlsafe(32)
    expires = deps.now() + timedelta(seconds=deps.config.invite_ttl_sec)
    deps.db.collection("adminInvites").document(sha256_hex(token)).set(
        {
            "email": req.email,
            "role": ROLE_ADMIN,
            "createdByUid": caller.uid,
            "createdAt": deps.now(),
            "expiresAt": expires,
            "usedAt": None,
            "usedByUid": None,
        }
    )
    audit(deps, caller, "admin.invite.create", {"email": req.email})
    return {
        "token": token,
        "link": f"{deps.config.app_url.rstrip('/')}/admin/invite/{token}",
        "expiresAt": expires.isoformat(),
    }


def accept_admin_invite(deps: Deps, caller: Caller | None, data: Any) -> dict:
    caller = require_auth(caller)
    req = parse(AcceptInviteReq, data)
    ref = deps.db.collection("adminInvites").document(sha256_hex(req.token))
    snap = ref.get()
    if not snap.exists:
        raise fail(Code.NOT_FOUND, "Invite not found.")
    invite = snap.to_dict()
    if invite.get("usedAt"):
        raise fail(Code.FAILED_PRECONDITION, "This invite has already been used.")
    if invite["expiresAt"] < deps.now():
        raise fail(Code.FAILED_PRECONDITION, "This invite has expired.")
    if invite.get("email") and (caller.email or "").lower() != invite["email"]:
        raise fail(Code.PERMISSION_DENIED, "This invite was issued for a different email address.")
    if caller.is_admin:
        raise fail(Code.ALREADY_EXISTS, "You are already an admin.")

    user = deps.auth.get_user(caller.uid)
    _set_role(deps, caller.uid, ROLE_ADMIN)
    ref.update({"usedAt": deps.now(), "usedByUid": caller.uid})
    deps.db.collection("adminUsers").document(caller.uid).set(
        {
            "email": user.email,
            "displayName": user.display_name or (user.email or "Admin").split("@")[0],
            "role": ROLE_ADMIN,
            "status": "active",
            "invitedBy": invite["createdByUid"],
            "createdAt": deps.now(),
        }
    )
    audit(deps, Caller(caller.uid, ROLE_ADMIN, caller.email), "admin.invite.accept", {"uid": caller.uid})
    return {"role": ROLE_ADMIN}


def _target_admin(deps: Deps, caller: Caller, uid: str) -> dict:
    if uid == caller.uid:
        raise fail(Code.FAILED_PRECONDITION, "You cannot change your own admin status.")
    snap = deps.db.collection("adminUsers").document(uid).get()
    if not snap.exists:
        raise fail(Code.NOT_FOUND, "Admin not found.")
    return snap.to_dict()


def deactivate_admin(deps: Deps, caller: Caller | None, data: Any) -> dict:
    """Deactivate (or reactivate with ``active=true``) another admin."""
    caller = require_admin(caller)
    req = parse(DeactivateAdminReq, data)
    target = _target_admin(deps, caller, req.uid)
    if target.get("role") == ROLE_SUPER_ADMIN and not caller.is_super_admin:
        raise fail(Code.PERMISSION_DENIED, "Only a Super Admin can change a Super Admin.")
    if req.active:
        _set_role(deps, req.uid, target.get("role", ROLE_ADMIN))
        status = "active"
    else:
        _set_role(deps, req.uid, ROLE_USER, adminDisabled=True)
        deps.auth.revoke_refresh_tokens(req.uid)
        status = "deactivated"
    deps.db.collection("adminUsers").document(req.uid).update({"status": status, "updatedAt": deps.now()})
    audit(deps, caller, "admin.activate" if req.active else "admin.deactivate", {"uid": req.uid})
    return {"status": status}


def remove_admin(deps: Deps, caller: Caller | None, data: Any) -> dict:
    caller = require_super_admin(caller)
    req = parse(RemoveAdminReq, data)
    target = _target_admin(deps, caller, req.uid)
    if target.get("role") == ROLE_SUPER_ADMIN:
        raise fail(Code.FAILED_PRECONDITION, "Super Admins cannot be removed.")
    _set_role(deps, req.uid, ROLE_USER)
    deps.auth.revoke_refresh_tokens(req.uid)
    deps.db.collection("adminUsers").document(req.uid).delete()
    audit(deps, caller, "admin.remove", {"uid": req.uid})
    return {"removed": True}
