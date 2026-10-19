#!/usr/bin/env python3
"""Create (or promote) the first Super Admin.

Usage:
  SUPER_ADMIN_EMAIL=guru@example.com SUPER_ADMIN_PASSWORD='...' \
    python scripts/bootstrap_super_admin.py --emulators
  # production (uses Application Default Credentials):
  SUPER_ADMIN_EMAIL=guru@example.com python scripts/bootstrap_super_admin.py --project <id>

If the user does not exist yet it is created with SUPER_ADMIN_PASSWORD; otherwise
the existing account is promoted. Sign out and back in for the claim to apply.
"""

from __future__ import annotations

import os
import sys

from _common import get_or_create_user, make_deps, parse_args


def main() -> None:
    parse_args(__doc__.splitlines()[0])
    email = os.environ.get("SUPER_ADMIN_EMAIL")
    if not email:
        sys.exit("Set SUPER_ADMIN_EMAIL.")
    deps = make_deps()
    user = get_or_create_user(deps, email, os.environ.get("SUPER_ADMIN_PASSWORD"), os.environ.get("SUPER_ADMIN_NAME", "Super Admin"))
    from lc.admins import make_super_admin

    make_super_admin(deps, user.uid)
    deps.db.collection("users").document(user.uid).set(
        {"displayName": user.display_name or email.split("@")[0], "email": email, "createdAt": deps.now()}, merge=True
    )
    print(f"✔ {email} (uid {user.uid}) is now SUPER_ADMIN. Sign in at /admin/login.")


if __name__ == "__main__":
    main()
