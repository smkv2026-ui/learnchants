"""Google Drive API v3 implementation of ``StorageProvider`` (scope ``drive.file``)."""

from __future__ import annotations

import json
from typing import Any, Callable, Iterator

from .backoff import with_backoff
from .base import (
    FOLDER_MIME,
    DriveAuthError,
    DriveError,
    DriveNotFoundError,
    DriveQuotaError,
    FileInfo,
    FolderInfo,
    StorageProvider,
    UploadSession,
    safe_name,
)

DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"
TOKEN_URI = "https://oauth2.googleapis.com/token"
_API = "https://www.googleapis.com/drive/v3"
_UPLOAD = "https://www.googleapis.com/upload/drive/v3"


def _q(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


class GoogleDriveProvider(StorageProvider):
    """Uses an ``AuthorizedSession`` built from the admin's refresh token."""

    def __init__(
        self,
        *,
        refresh_token: str,
        client_id: str,
        client_secret: str,
        on_token_invalid: Callable[[], None] | None = None,
        session: Any | None = None,
    ):
        self._on_token_invalid = on_token_invalid
        if session is not None:
            self._session = session
            return
        from google.auth.transport.requests import AuthorizedSession
        from google.oauth2.credentials import Credentials

        creds = Credentials(
            token=None,
            refresh_token=refresh_token,
            token_uri=TOKEN_URI,
            client_id=client_id,
            client_secret=client_secret,
            scopes=[DRIVE_SCOPE],
        )
        self._session = AuthorizedSession(creds)

    # -- HTTP plumbing -----------------------------------------------------
    def _request(self, method: str, url: str, *, ok=(200,), **kwargs) -> Any:
        from google.auth.exceptions import RefreshError

        def call():
            try:
                resp = self._session.request(method, url, timeout=60, **kwargs)
            except RefreshError as exc:
                if self._on_token_invalid:
                    self._on_token_invalid()
                raise DriveAuthError("Drive authorisation expired") from exc
            if resp.status_code in ok:
                return resp
            self._raise_for(resp)

        return with_backoff(call)

    def _raise_for(self, resp: Any) -> None:
        status = resp.status_code
        reason = ""
        try:
            errors = resp.json().get("error", {}).get("errors", [])
            reason = errors[0].get("reason", "") if errors else ""
        except Exception:  # noqa: BLE001 - non-JSON error body
            pass
        if status == 401:
            if self._on_token_invalid:
                self._on_token_invalid()
            raise DriveAuthError("Drive authorisation expired")
        if status == 429 or status >= 500 or reason in {"rateLimitExceeded", "userRateLimitExceeded"}:
            raise DriveQuotaError(f"Drive quota/transient error {status} {reason}")
        if status == 404:
            raise DriveNotFoundError("Drive item not found")
        raise DriveError(f"Drive error {status} {reason}")

    # -- folders -----------------------------------------------------------
    def get_folder(self, folder_id: str) -> FolderInfo:
        resp = self._request(
            "GET", f"{_API}/files/{folder_id}", params={"fields": "id,name,mimeType,trashed"}
        )
        data = resp.json()
        if data.get("mimeType") != FOLDER_MIME or data.get("trashed"):
            raise DriveNotFoundError(folder_id)
        return FolderInfo(data["id"], data["name"])

    def create_folder(self, name: str, parent_id: str | None) -> FolderInfo:
        body: dict[str, Any] = {"name": safe_name(name), "mimeType": FOLDER_MIME}
        if parent_id:
            body["parents"] = [parent_id]
        resp = self._request("POST", f"{_API}/files", params={"fields": "id,name"}, json=body)
        data = resp.json()
        return FolderInfo(data["id"], data["name"])

    def find_child_folder(self, parent_id: str | None, name: str) -> FolderInfo | None:
        parent_id = parent_id or "root"
        q = (
            f"'{_q(parent_id)}' in parents and name = '{_q(safe_name(name))}' "
            f"and mimeType = '{FOLDER_MIME}' and trashed = false"
        )
        resp = self._request("GET", f"{_API}/files", params={"q": q, "fields": "files(id,name)", "pageSize": 1})
        files = resp.json().get("files", [])
        return FolderInfo(files[0]["id"], files[0]["name"]) if files else None

    def rename(self, item_id: str, new_name: str) -> None:
        self._request("PATCH", f"{_API}/files/{item_id}", params={"fields": "id"}, json={"name": safe_name(new_name)})

    def move(self, item_id: str, new_parent_id: str) -> None:
        resp = self._request("GET", f"{_API}/files/{item_id}", params={"fields": "parents"})
        old = ",".join(resp.json().get("parents", []))
        self._request(
            "PATCH",
            f"{_API}/files/{item_id}",
            params={"addParents": new_parent_id, "removeParents": old, "fields": "id"},
        )

    def delete(self, item_id: str) -> None:
        # Move to trash rather than deleting permanently, so mistakes are recoverable.
        try:
            self._request("PATCH", f"{_API}/files/{item_id}", params={"fields": "id"}, json={"trashed": True})
        except DriveNotFoundError:
            pass

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
        headers = {
            "X-Upload-Content-Type": mime_type,
            "Content-Type": "application/json; charset=UTF-8",
            # Passing the browser origin makes Drive return CORS headers so the
            # browser can PUT bytes straight to the session URI.
            "Origin": origin,
        }
        if size:
            headers["X-Upload-Content-Length"] = str(size)
        body = {"name": safe_name(name, "file"), "parents": [parent_id], "appProperties": app_properties}
        resp = self._request(
            "POST",
            f"{_UPLOAD}/files",
            params={"uploadType": "resumable", "fields": "id"},
            headers=headers,
            data=json.dumps(body),
        )
        location = resp.headers.get("Location")
        if not location:
            raise DriveError("Drive did not return an upload session")
        return UploadSession(session=location)

    def find_by_app_property(self, parent_id: str, key: str, value: str) -> FileInfo | None:
        q = (
            f"'{_q(parent_id)}' in parents and trashed = false and "
            f"appProperties has {{ key='{_q(key)}' and value='{_q(value)}' }}"
        )
        resp = self._request(
            "GET", f"{_API}/files", params={"q": q, "fields": "files(id,name,size,mimeType)", "pageSize": 1}
        )
        files = resp.json().get("files", [])
        if not files:
            return None
        f = files[0]
        return FileInfo(f["id"], f["name"], int(f.get("size", 0)), f.get("mimeType", ""))

    def open_range(self, file_id: str, start: int, end: int | None) -> Iterator[bytes]:
        rng = f"bytes={start}-{'' if end is None else end}"
        resp = self._request(
            "GET",
            f"{_API}/files/{file_id}",
            ok=(200, 206),
            params={"alt": "media"},
            headers={"Range": rng},
            stream=True,
        )
        try:
            yield from resp.iter_content(chunk_size=256 * 1024)
        finally:
            resp.close()
