"""Media storage abstraction.

``StorageProvider`` is implemented by ``GoogleDriveProvider`` (real Drive API v3,
``drive.file`` scope) and ``LocalMockProvider`` (local disk, used when
``MOCK_DRIVE=true`` so everything works on the emulators without Google
credentials).
"""

from .base import (
    DriveAuthError,
    DriveError,
    DriveNotFoundError,
    FileInfo,
    FolderInfo,
    StorageProvider,
    UploadSession,
)
from .backoff import with_backoff

__all__ = [
    "DriveAuthError",
    "DriveError",
    "DriveNotFoundError",
    "FileInfo",
    "FolderInfo",
    "StorageProvider",
    "UploadSession",
    "with_backoff",
]
