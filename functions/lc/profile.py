"""Learner profile bootstrap: default role claim and ``users/{uid}`` doc."""

from __future__ import annotations

from typing import Any

from .core import ROLE_USER, Caller, Deps, parse, require_auth
from .models import InitProfileReq


def init_profile(deps: Deps, caller: Caller | None, data: Any) -> dict:
    caller = require_auth(caller)
    req = parse(InitProfileReq, data)
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
