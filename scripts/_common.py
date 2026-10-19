"""Shared setup for one-off scripts.

Works against the emulators when ``FIRESTORE_EMULATOR_HOST`` /
``FIREBASE_AUTH_EMULATOR_HOST`` are set (``--emulators`` sets them for you), or
against a real project using Application Default Credentials.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "functions"))


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


def make_deps(mock_drive: bool | None = None):
    from firebase_admin import auth, firestore

    from lc.config import Config
    from lc.core import Deps
    from lc.storage import default_storage_factory

    from lc.firebase_app import init_app

    init_app(os.environ["GCLOUD_PROJECT"])
    config = Config.from_env()
    if mock_drive is not None:
        from dataclasses import replace

        config = replace(config, mock_drive=mock_drive)
    return Deps(db=firestore.client(), auth=auth, config=config, storage_factory=default_storage_factory)


def get_or_create_user(deps, email: str, password: str | None, name: str):
    from firebase_admin import auth

    try:
        return auth.get_user_by_email(email)
    except auth.UserNotFoundError:
        if not password:
            sys.exit(f"User {email} does not exist; pass a password to create it.")
        return auth.create_user(email=email, password=password, display_name=name, email_verified=True)
