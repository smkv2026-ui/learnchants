"""Initialise the default firebase_admin app (anonymous credentials on emulators)."""

from __future__ import annotations

import os

import firebase_admin
from firebase_admin import credentials


class _EmulatorCredential(credentials.Base):
    """Emulators accept unauthenticated calls, so no Application Default Credentials are needed."""

    def get_credential(self):
        from google.auth.credentials import AnonymousCredentials

        return AnonymousCredentials()


def using_emulators() -> bool:
    return os.environ.get("FUNCTIONS_EMULATOR") == "true" or bool(os.environ.get("FIRESTORE_EMULATOR_HOST"))


def init_app(project_id: str | None = None) -> firebase_admin.App:
    if firebase_admin._apps:  # noqa: SLF001
        return firebase_admin.get_app()
    cred = _EmulatorCredential() if using_emulators() else None
    project = project_id or os.environ.get("GCLOUD_PROJECT") or os.environ.get("GOOGLE_CLOUD_PROJECT")
    return firebase_admin.initialize_app(cred, options={"projectId": project} if project else None)
