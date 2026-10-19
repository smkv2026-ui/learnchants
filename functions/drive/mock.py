"""Local-disk implementation of ``StorageProvider`` for ``MOCK_DRIVE=true``.

Folders and files are real directories/files under ``root`` so the mirrored
structure can be inspected on disk. Opaque ids map to relative paths through an
index file, so renames and moves keep ids stable (like Drive does).
"""

from __future__ import annotations

import json
import secrets
import shutil
import threading
from pathlib import Path
from typing import Iterator

from .base import (
    DriveError,
    DriveNotFoundError,
    FileInfo,
    FolderInfo,
    StorageProvider,
    UploadSession,
    safe_name,
)

_LOCK = threading.RLock()


class LocalMockProvider(StorageProvider):
    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self._index_path = self.root / ".index.json"
        self._sessions = self.root / ".sessions"
        self._sessions.mkdir(exist_ok=True)

    # -- index helpers -----------------------------------------------------
    def _load(self) -> dict:
        if not self._index_path.exists():
            return {"items": {}}
        return json.loads(self._index_path.read_text("utf-8"))

    def _save(self, index: dict) -> None:
        tmp = self._index_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(index, indent=1, ensure_ascii=False), "utf-8")
        tmp.replace(self._index_path)

    def _item(self, index: dict, item_id: str) -> dict:
        item = index["items"].get(item_id)
        if not item:
            raise DriveNotFoundError(item_id)
        return item

    def path_of(self, item_id: str) -> Path:
        with _LOCK:
            return self.root / self._item(self._load(), item_id)["path"]

    @staticmethod
    def _unique(path: Path) -> Path:
        if not path.exists():
            return path
        stem, suffix = path.stem, path.suffix
        n = 2
        while True:
            candidate = path.with_name(f"{stem} ({n}){suffix}")
            if not candidate.exists():
                return candidate
            n += 1

    # -- folders -----------------------------------------------------------
    def get_folder(self, folder_id: str) -> FolderInfo:
        with _LOCK:
            item = self._item(self._load(), folder_id)
            if item["type"] != "folder" or not (self.root / item["path"]).is_dir():
                raise DriveNotFoundError(folder_id)
            return FolderInfo(folder_id, Path(item["path"]).name)

    def create_folder(self, name: str, parent_id: str | None) -> FolderInfo:
        name = safe_name(name)
        with _LOCK:
            index = self._load()
            parent_rel = Path(self._item(index, parent_id)["path"]) if parent_id else Path()
            target = self._unique(self.root / parent_rel / name)
            target.mkdir(parents=True)
            folder_id = "mf_" + secrets.token_hex(8)
            index["items"][folder_id] = {
                "type": "folder",
                "path": target.relative_to(self.root).as_posix(),
                "parent": parent_id,
            }
            self._save(index)
            return FolderInfo(folder_id, target.name)

    def find_child_folder(self, parent_id: str | None, name: str) -> FolderInfo | None:
        name = safe_name(name)
        with _LOCK:
            for item_id, item in self._load()["items"].items():
                if (
                    item["type"] == "folder"
                    and item.get("parent") == parent_id
                    and Path(item["path"]).name == name
                    and (self.root / item["path"]).is_dir()
                ):
                    return FolderInfo(item_id, name)
        return None

    def _relocate(self, index: dict, item_id: str, new_path: Path) -> None:
        item = self._item(index, item_id)
        old_rel = item["path"]
        new_path = self._unique(new_path)
        new_path.parent.mkdir(parents=True, exist_ok=True)
        (self.root / old_rel).rename(new_path)
        new_rel = new_path.relative_to(self.root).as_posix()
        prefix = old_rel + "/"
        for other in index["items"].values():
            if other["path"] == old_rel:
                other["path"] = new_rel
            elif other["path"].startswith(prefix):
                other["path"] = new_rel + "/" + other["path"][len(prefix):]

    def rename(self, item_id: str, new_name: str) -> None:
        with _LOCK:
            index = self._load()
            item = self._item(index, item_id)
            current = self.root / item["path"]
            if current.name == safe_name(new_name):
                return
            self._relocate(index, item_id, current.with_name(safe_name(new_name)))
            self._save(index)

    def move(self, item_id: str, new_parent_id: str) -> None:
        with _LOCK:
            index = self._load()
            item = self._item(index, item_id)
            parent = self._item(index, new_parent_id)
            current = self.root / item["path"]
            self._relocate(index, item_id, self.root / parent["path"] / current.name)
            item["parent"] = new_parent_id
            self._save(index)

    def delete(self, item_id: str) -> None:
        with _LOCK:
            index = self._load()
            item = index["items"].get(item_id)
            if not item:
                return
            path = self.root / item["path"]
            if path.is_dir():
                shutil.rmtree(path, ignore_errors=True)
            elif path.exists():
                path.unlink()
            prefix = item["path"] + "/"
            for key in [k for k, v in index["items"].items() if k == item_id or v["path"].startswith(prefix)]:
                del index["items"][key]
            self._save(index)

    # -- uploads -----------------------------------------------------------
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
        self.get_folder(parent_id)
        session_id = secrets.token_urlsafe(24)
        meta = {
            "parent": parent_id,
            "name": safe_name(name, "file"),
            "mimeType": mime_type,
            "size": size,
            "appProperties": app_properties,
        }
        (self._sessions / f"{session_id}.json").write_text(json.dumps(meta), "utf-8")
        (self._sessions / f"{session_id}.part").write_bytes(b"")
        return UploadSession(session=session_id, is_mock=True)

    def session_received(self, session_id: str) -> int:
        part = self._sessions / f"{session_id}.part"
        if not part.exists():
            raise DriveNotFoundError(session_id)
        return part.stat().st_size

    def write_chunk(self, session_id: str, start: int, data: bytes, total: int | None) -> FileInfo | None:
        """Append a chunk; returns the stored file when the upload is complete."""
        meta_path = self._sessions / f"{session_id}.json"
        part = self._sessions / f"{session_id}.part"
        if not meta_path.exists():
            raise DriveNotFoundError(session_id)
        with _LOCK:
            received = part.stat().st_size
            if start != received:
                raise DriveError(f"chunk offset {start} != received {received}")
            with part.open("ab") as fh:
                fh.write(data)
            received += len(data)
            if total is None or received < total:
                return None
            meta = json.loads(meta_path.read_text("utf-8"))
            index = self._load()
            parent = self._item(index, meta["parent"])
            target = self._unique(self.root / parent["path"] / meta["name"])
            part.rename(target)
            meta_path.unlink()
            file_id = "mfile_" + secrets.token_hex(8)
            index["items"][file_id] = {
                "type": "file",
                "path": target.relative_to(self.root).as_posix(),
                "parent": meta["parent"],
                "mimeType": meta["mimeType"],
                "appProperties": meta["appProperties"],
            }
            self._save(index)
            return FileInfo(file_id, target.name, received, meta["mimeType"])

    def find_by_app_property(self, parent_id: str, key: str, value: str) -> FileInfo | None:
        with _LOCK:
            for item_id, item in self._load()["items"].items():
                if (
                    item["type"] == "file"
                    and item.get("parent") == parent_id
                    and item.get("appProperties", {}).get(key) == value
                ):
                    path = self.root / item["path"]
                    if path.exists():
                        return FileInfo(item_id, path.name, path.stat().st_size, item["mimeType"])
        return None

    def open_range(self, file_id: str, start: int, end: int | None) -> Iterator[bytes]:
        path = self.path_of(file_id)
        if not path.is_file():
            raise DriveNotFoundError(file_id)
        size = path.stat().st_size
        last = size - 1 if end is None else min(end, size - 1)
        remaining = last - start + 1
        with path.open("rb") as fh:
            fh.seek(start)
            while remaining > 0:
                chunk = fh.read(min(256 * 1024, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk
