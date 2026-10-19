from __future__ import annotations

import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Iterator

FOLDER_MIME = "application/vnd.google-apps.folder"


class DriveError(Exception):
    """Generic storage failure."""


class DriveAuthError(DriveError):
    """The stored credentials are no longer valid; the admin must reconnect."""


class DriveNotFoundError(DriveError):
    """The referenced file or folder does not exist or is not accessible."""


class DriveQuotaError(DriveError):
    """Rate limited / quota exceeded (retryable)."""


@dataclass(frozen=True)
class FolderInfo:
    id: str
    name: str


@dataclass(frozen=True)
class FileInfo:
    id: str
    name: str
    size: int
    mime_type: str


@dataclass(frozen=True)
class UploadSession:
    # For Google this is the resumable session URI; for the mock provider it is
    # an opaque session id that the caller turns into a ``/mock-upload/<id>`` URL.
    session: str
    is_mock: bool = False


_UNSAFE = re.compile(r"[\\/:*?\"<>|\x00-\x1f]+")


def safe_name(name: str, fallback: str = "Untitled") -> str:
    """Make a human-readable, filesystem/Drive-safe folder or file name."""
    cleaned = _UNSAFE.sub(" ", name or "").strip().strip(".")
    cleaned = re.sub(r"\s+", " ", cleaned)
    return (cleaned or fallback)[:120]


class StorageProvider(ABC):
    """Operations the app needs from a media store. IDs are opaque strings."""

    @abstractmethod
    def get_folder(self, folder_id: str) -> FolderInfo:
        """Return folder info or raise ``DriveNotFoundError``."""

    @abstractmethod
    def create_folder(self, name: str, parent_id: str | None) -> FolderInfo:
        ...

    @abstractmethod
    def find_child_folder(self, parent_id: str | None, name: str) -> FolderInfo | None:
        """Find a folder by name under ``parent_id`` (``None`` = top level)."""

    @abstractmethod
    def rename(self, item_id: str, new_name: str) -> None:
        ...

    @abstractmethod
    def move(self, item_id: str, new_parent_id: str) -> None:
        ...

    @abstractmethod
    def delete(self, item_id: str) -> None:
        ...

    @abstractmethod
    def create_upload_session(
        self,
        *,
        parent_id: str,
        name: str,
        mime_type: str,
        size: int | None,
        app_properties: dict[str, str],
        origin: str,
    ) -> UploadSession:
        ...

    @abstractmethod
    def find_by_app_property(self, parent_id: str, key: str, value: str) -> FileInfo | None:
        ...

    @abstractmethod
    def open_range(self, file_id: str, start: int, end: int | None) -> Iterator[bytes]:
        """Yield bytes ``start..end`` (inclusive; ``end=None`` means to EOF)."""

    def ensure_folder(self, parent_id: str, name: str, cached_id: str | None = None) -> FolderInfo:
        """Idempotently return the folder ``name`` under ``parent_id``.

        A cached id is verified first (and renamed if the logical name changed),
        then an existing child with the same name is reused, else it is created.
        """
        name = safe_name(name)
        if cached_id:
            try:
                info = self.get_folder(cached_id)
                if info.name != name:
                    self.rename(cached_id, name)
                return FolderInfo(cached_id, name)
            except DriveNotFoundError:
                pass
        existing = self.find_child_folder(parent_id, name)
        if existing:
            return existing
        return self.create_folder(name, parent_id)
