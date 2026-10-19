"""Learner profile bootstrap: default role claim and ``users/{uid}`` doc."""

from __future__ import annotations

from typing import Any

from google.cloud.firestore_v1.base_query import FieldFilter

from .core import ROLE_SUPER_ADMIN, ROLE_USER, Caller, Deps, audit, log, parse, require_auth
from .models import InitProfileReq


def _maybe_bootstrap_super_admin(deps: Deps, caller: Caller, user) -> bool:
    """Promote the configured owner email to SUPER_ADMIN on first verified sign-in.

    Only fires while no Super Admin exists, so it cannot be used to take over a
    running installation, and only for a verified email (e.g. Google sign-in).
    """
    wanted = deps.config.bootstrap_super_admin_email
    if not wanted or (user.email or "").lower() != wanted or not getattr(user, "email_verified", False):
        return False
    existing = deps.db.collection("adminUsers").where(filter=FieldFilter("role", "==", ROLE_SUPER_ADMIN)).limit(1)
    if list(existing.stream()):
        return False
    from .admins import make_super_admin

    make_super_admin(deps, caller.uid)
    audit(deps, Caller(caller.uid, ROLE_SUPER_ADMIN, user.email), "admin.bootstrap", {"uid": caller.uid})
    log("admin.bootstrap")
    return True


def init_profile(deps: Deps, caller: Caller | None, data: Any) -> dict:
    caller = require_auth(caller)
    req = parse(InitProfileReq, data)
    user = deps.auth.get_user(caller.uid)
    if _maybe_bootstrap_super_admin(deps, caller, user):
        user = deps.auth.get_user(caller.uid)
    claims = dict(user.custom_claims or {})
    if not claims.get("role"):
        claims["role"] = ROLE_USER
        deps.auth.set_custom_user_claims(caller.uid, claims)

    ref = deps.db.collection("users").document(caller.uid)
    snap = ref.get()
    name = req.displayName or user.display_name or (user.email or "Learner").split("@")[0]
    if not snap.exists:
        ref.set({"displayName": name, "email": user.email, "createdAt": deps.now()})
    elif req.displayName:
        ref.set({"displayName": req.displayName}, merge=True)
    return {"role": claims["role"], "refreshToken": claims["role"] != caller.role}
