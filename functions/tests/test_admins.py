import pytest
from firebase_functions.https_fn import HttpsError

from lc import admins, profile
from lc.core import Caller

from .conftest import ADMIN, LEARNER, LEARNER2, SUPER


def code(exc):
    return exc.value.code.value if hasattr(exc.value.code, "value") else exc.value.code


def test_init_profile_defaults_to_user_role(deps):
    deps.auth.add("new1", "new@example.com", None)
    res = profile.init_profile(deps, Caller("new1"), {"displayName": "Nila"})
    assert res["role"] == "USER"
    assert deps.auth.get_user("new1").custom_claims == {"role": "USER"}
    assert deps.db.data("users/new1")["displayName"] == "Nila"


def test_init_profile_never_downgrades_admin(deps):
    profile.init_profile(deps, SUPER, {})
    assert deps.auth.get_user(SUPER.uid).custom_claims["role"] == "SUPER_ADMIN"


def test_init_profile_requires_auth(deps):
    with pytest.raises(HttpsError) as e:
        profile.init_profile(deps, None, {})
    assert code(e) == "unauthenticated"


def test_learner_cannot_create_invite(deps):
    with pytest.raises(HttpsError) as e:
        admins.create_admin_invite(deps, LEARNER, {})
    assert code(e) == "permission-denied"


def test_invite_flow_promotes_user_and_is_single_use(deps):
    inv = admins.create_admin_invite(deps, ADMIN, {"email": "Learner@Example.com"})
    assert inv["link"].endswith(inv["token"]) and "/admin/invite/" in inv["link"]
    # token is stored hashed only
    assert all(inv["token"] not in path for path in deps.db.docs)
    with pytest.raises(HttpsError) as e:
        admins.accept_admin_invite(deps, LEARNER2, {"token": inv["token"]})
    assert code(e) == "permission-denied"  # email mismatch
    assert admins.accept_admin_invite(deps, LEARNER, {"token": inv["token"]}) == {"role": "ADMIN"}
    assert deps.auth.get_user(LEARNER.uid).custom_claims["role"] == "ADMIN"
    assert deps.db.data(f"adminUsers/{LEARNER.uid}")["status"] == "active"
    with pytest.raises(HttpsError) as e:
        admins.accept_admin_invite(deps, LEARNER, {"token": inv["token"]})
    assert code(e) == "failed-precondition"
    actions = [d["action"] for p, d in deps.db.docs.items() if p.startswith("auditLogs/")]
    assert "admin.invite.create" in actions and "admin.invite.accept" in actions


def test_invite_expires(deps, clock):
    inv = admins.create_admin_invite(deps, ADMIN, {})
    clock.advance(days=8)
    with pytest.raises(HttpsError) as e:
        admins.accept_admin_invite(deps, LEARNER, {"token": inv["token"]})
    assert code(e) == "failed-precondition"


def test_deactivate_and_reactivate(deps):
    with pytest.raises(HttpsError):
        admins.deactivate_admin(deps, LEARNER, {"uid": ADMIN.uid})
    with pytest.raises(HttpsError) as e:
        admins.deactivate_admin(deps, ADMIN, {"uid": SUPER.uid})
    assert code(e) == "permission-denied"
    with pytest.raises(HttpsError):
        admins.deactivate_admin(deps, SUPER, {"uid": SUPER.uid})  # self
    admins.deactivate_admin(deps, SUPER, {"uid": ADMIN.uid})
    claims = deps.auth.get_user(ADMIN.uid).custom_claims
    assert claims["role"] == "USER" and claims["adminDisabled"] is True
    assert ADMIN.uid in deps.auth.revoked
    admins.deactivate_admin(deps, SUPER, {"uid": ADMIN.uid, "active": True})
    assert deps.auth.get_user(ADMIN.uid).custom_claims == {"role": "ADMIN"}


def test_remove_admin_super_only(deps):
    with pytest.raises(HttpsError) as e:
        admins.remove_admin(deps, ADMIN, {"uid": SUPER.uid})
    assert code(e) == "permission-denied"
    admins.remove_admin(deps, SUPER, {"uid": ADMIN.uid})
    assert deps.auth.get_user(ADMIN.uid).custom_claims["role"] == "USER"
    assert deps.db.data(f"adminUsers/{ADMIN.uid}") is None


def test_make_super_admin(deps):
    admins.make_super_admin(deps, LEARNER.uid)
    assert deps.auth.get_user(LEARNER.uid).custom_claims["role"] == "SUPER_ADMIN"
    assert deps.db.data(f"adminUsers/{LEARNER.uid}")["role"] == "SUPER_ADMIN"
