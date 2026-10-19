"""Runtime configuration read from environment variables / Firebase params.

Secrets (Secret Manager) are exposed to functions as environment variables when
declared via ``secrets=[...]`` on the function, so reading ``os.environ`` covers
both deployed and emulated runs.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def _bool(value: str | None, default: bool = False) -> bool:
    if value is None or value == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Config:
    app_url: str = "http://localhost:5173"
    mock_drive: bool = True
    mock_drive_root: Path = field(default_factory=lambda: REPO_ROOT / ".mock_drive")
    google_client_id: str = ""
    google_client_secret: str = ""
    token_encryption_key: str = ""
    media_token_secret: str = ""
    # The first verified sign-in with this email becomes SUPER_ADMIN, once, while none exists.
    bootstrap_super_admin_email: str = ""
    media_token_ttl_sec: int = 15 * 60
    oauth_state_ttl_sec: int = 10 * 60
    invite_ttl_sec: int = 7 * 24 * 3600
    # Upper bounds for uploads (bytes) by purpose.
    max_audio_bytes: int = 50 * 1024 * 1024
    max_video_bytes: int = 500 * 1024 * 1024
    max_doc_bytes: int = 30 * 1024 * 1024

    @property
    def google_oauth_configured(self) -> bool:
        return bool(self.google_client_id) and self.google_client_id != "not-configured" and bool(self.google_client_secret)

    @property
    def drive_redirect_uri(self) -> str:
        return f"{self.app_url.rstrip('/')}/drive/callback"

    @staticmethod
    def from_env() -> "Config":
        env = os.environ
        root = env.get("MOCK_DRIVE_ROOT")
        return Config(
            app_url=env.get("APP_URL", "http://localhost:5173"),
            mock_drive=_bool(env.get("MOCK_DRIVE"), default=False),
            mock_drive_root=Path(root) if root else REPO_ROOT / ".mock_drive",
            google_client_id=env.get("GOOGLE_CLIENT_ID", ""),
            google_client_secret=env.get("GOOGLE_CLIENT_SECRET", ""),
            token_encryption_key=env.get("TOKEN_ENCRYPTION_KEY", ""),
            media_token_secret=env.get("MEDIA_TOKEN_SECRET", ""),
            bootstrap_super_admin_email=env.get("BOOTSTRAP_SUPER_ADMIN_EMAIL", "").strip().lower(),
        )
