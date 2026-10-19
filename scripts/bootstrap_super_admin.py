#!/usr/bin/env python3
"""Create (or promote) a Super Admin directly (emulators or with admin credentials).

On a live site you normally don't need this: the owner email written into
firestore.rules by scripts/deploy.sh becomes Super Admin on its first Google
sign-in at /admin/login.

Usage:
  SUPER_ADMIN_EMAIL=guru@demo.test SUPER_ADMIN_PASSWORD=guru12345 \
    python scripts/bootstrap_super_admin.py --emulators
"""

from __future__ import annotations

import os
import sys

from _common import get_or_create_user, init, now, parse_args


def main() -> None:
    parse_args(__doc__.splitlines()[0])
    email = os.environ.get("SUPER_ADMIN_EMAIL")
    if not email:
        sys.exit("Set SUPER_ADMIN_EMAIL.")
    db, auth = init()
    user = get_or_create_user(auth, email, os.environ.get("SUPER_ADMIN_PASSWORD"), os.environ.get("SUPER_ADMIN_NAME", "Super Admin"))
    name = user.display_name or email.split("@")[0]
    db.collection("adminUsers").document(user.uid).set(
        {"email": email, "displayName": name, "role": "SUPER_ADMIN", "status": "active", "createdAt": now(), "inviteId": None}
    )
    db.collection("users").document(user.uid).set({"displayName": name, "email": email, "createdAt": now()}, merge=True)
    print(f"✔ {email} (uid {user.uid}) is now SUPER_ADMIN. Sign in at /admin/login.")


if __name__ == "__main__":
    main()
