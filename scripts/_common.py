"""Shared setup for the one-off scripts (Firestore + Auth via firebase-admin).

Use ``--emulators`` for the local Emulator Suite (no credentials needed), or
Application Default Credentials (``gcloud auth application-default login``)
against a real project.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone


def parse_args(description: str, extra=None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--project", default=os.environ.get("GCLOUD_PROJECT", "demo-learnchants"))
    parser.add_argument("--emulators", action="store_true", help="target the local emulator suite")
    if extra:
        extra(parser)
    args = parser.parse_args()
    if args.emulators:
        os.environ.setdefault("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080")
        os.environ.setdefault("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099")
    os.environ["GCLOUD_PROJECT"] = args.project
    os.environ.setdefault("GOOGLE_CLOUD_PROJECT", args.project)
    return args


def init():
    """Return (firestore client, auth module)."""
    import firebase_admin
    from firebase_admin import auth, credentials, firestore

    if not firebase_admin._apps:  # noqa: SLF001
        cred = None
        if os.environ.get("FIRESTORE_EMULATOR_HOST"):
            from google.auth.credentials import AnonymousCredentials

            class _EmulatorCredential(credentials.Base):
                def get_credential(self):
                    return AnonymousCredentials()

            cred = _EmulatorCredential()
        firebase_admin.initialize_app(cred, options={"projectId": os.environ["GCLOUD_PROJECT"]})
    return firestore.client(), auth


def now() -> datetime:
    return datetime.now(timezone.utc)


def get_or_create_user(auth, email: str, password: str | None, name: str):
    try:
        return auth.get_user_by_email(email)
    except auth.UserNotFoundError:
        if not password:
            sys.exit(f"User {email} does not exist; pass a password to create it.")
        return auth.create_user(email=email, password=password, display_name=name, email_verified=True)
