from dataclasses import replace

from lc import profile
from lc.core import Caller

from .conftest import SUPER


def _deps(deps, email="owner@example.org"):
    deps.config = replace(deps.config, bootstrap_super_admin_email=email)
    return deps


def _clear_supers(deps):
    for path in [p for p, d in deps.db.docs.items() if p.startswith("adminUsers/") and d.get("role") == "SUPER_ADMIN"]:
        del deps.db.docs[path]


def test_configured_email_becomes_super_admin_once(deps):
    _deps(deps)
    _clear_supers(deps)
    deps.auth.add("owner", "Owner@Example.org", "Owner")
    res = profile.init_profile(deps, Caller("owner", email="owner@example.org"), {})
    assert res == {"role": "SUPER_ADMIN", "refreshToken": True}
    assert deps.db.data("adminUsers/owner")["role"] == "SUPER_ADMIN"
    # a second account with the same email (e.g. another provider) is not promoted
    deps.auth.add("owner2", "owner@example.org", "Owner")
    assert profile.init_profile(deps, Caller("owner2"), {})["role"] == "USER"


def test_not_promoted_when_super_admin_exists_or_unverified(deps):
    _deps(deps, SUPER.email)
    deps.auth.add("dup", SUPER.email, "x")
    assert profile.init_profile(deps, Caller("dup"), {})["role"] == "USER"
    _clear_supers(deps)
    _deps(deps, "new@example.org")
    u = deps.auth.add("unverified", "new@example.org", "x")
    u.email_verified = False
    assert profile.init_profile(deps, Caller("unverified"), {})["role"] == "USER"


def test_other_emails_unaffected(deps):
    _deps(deps)
    _clear_supers(deps)
    deps.auth.add("someone", "someone@example.org", "x")
    assert profile.init_profile(deps, Caller("someone"), {})["role"] == "USER"
