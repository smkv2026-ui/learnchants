"""Drive connection, storage-location resolution and mirrored folder paths.

Folder layout (FR-D2 / FR-D6)::

    <Root>/<Playlist>/<Node>/.../<Verse>/{audio,video}/...
    <Root>/<Playlist>/<Node>/materials/...
    <Root>/<Playlist>/_Learners/<Name>_<uid>/<Verse>/<timestamp>.<ext>
    <Root>/<Playlist>/_Payments/<Name>_<uid>/...

Folder ids are cached in ``driveFolders`` (functions-only) keyed by *entity ids*
(not names) so renames keep the mapping; the cached ``parentId`` makes a change
of storage root a cache miss, so new content goes to the new location.
"""

from __future__ import annotations

import secrets
import time
from typing import Any, Callable
from urllib.parse import urlencode

from google.cloud.firestore_v1.base_query import FieldFilter

from drive import DriveAuthError, DriveError, DriveNotFoundError, StorageProvider
from drive.base import safe_name

from .access import get_playlist, owner_of
from .core import Caller, Code, Deps, audit, fail, log, parse, require_admin, fget
from .crypto import InvalidToken, decrypt, encrypt, sha256_hex, sign, verify
from .models import MoveStorageReq, StorageLocationReq

DEFAULT_ROOT_NAME = "LearnChants"
OAUTH_AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth"
OAUTH_SCOPES = "https://www.googleapis.com/auth/drive.file openid email"

Segment = tuple[str, str]  # (stable entity key, display name)


# ---------------------------------------------------------------------------
# Provider factory
# ---------------------------------------------------------------------------
def _settings_ref(deps: Deps, uid: str):
    return deps.db.collection("adminSettings").document(uid)


def mark_needs_reconnect(deps: Deps, owner_uid: str) -> None:
    deps.db.collection("driveConnections").document(owner_uid).set(
        {"status": "needs_reconnect", "updatedAt": deps.now()}, merge=True
    )
    _settings_ref(deps, owner_uid).set({"driveStatus": "needs_reconnect"}, merge=True)
    log("drive.needs_reconnect")


def default_storage_factory(deps: Deps, owner_uid: str) -> StorageProvider:
    if deps.config.mock_drive:
        from drive.mock import LocalMockProvider

        return LocalMockProvider(deps.config.mock_drive_root)
    snap = deps.db.collection("driveConnections").document(owner_uid).get()
    conn = snap.to_dict() if snap.exists else None
    if not conn or fget(conn, "status") != "connected" or not fget(conn, "refreshTokenEnc"):
        raise fail(
            Code.FAILED_PRECONDITION,
            "The teacher's storage is not connected. Please try again later.",
            {"reason": "DRIVE_NOT_CONNECTED"},
        )
    from drive.google import GoogleDriveProvider

    return GoogleDriveProvider(
        refresh_token=decrypt(conn["refreshTokenEnc"], deps.config.token_encryption_key),
        client_id=deps.config.google_client_id,
        client_secret=deps.config.google_client_secret,
        on_token_invalid=lambda: mark_needs_reconnect(deps, owner_uid),
    )


def drive_call(fn: Callable[[], Any]) -> Any:
    """Translate storage exceptions into callable errors."""
    try:
        return fn()
    except DriveAuthError as exc:
        raise fail(Code.FAILED_PRECONDITION, "Drive needs to be reconnected.", {"reason": "DRIVE_RECONNECT"}) from exc
    except DriveNotFoundError as exc:
        raise fail(Code.NOT_FOUND, "Storage folder or file not found.") from exc
    except DriveError as exc:
        log("drive.error", error=str(exc))
        raise fail(Code.UNAVAILABLE, "Storage is temporarily unavailable. Please retry.") from exc


# ---------------------------------------------------------------------------
# Root resolution and mirrored paths
# ---------------------------------------------------------------------------
def default_root(deps: Deps, provider: StorageProvider, owner_uid: str) -> str:
    settings = _settings_ref(deps, owner_uid).get()
    folder_id = fget(settings, "defaultFolderId") if settings.exists else None
    if folder_id:
        return folder_id
    info = drive_call(lambda: provider.create_folder(DEFAULT_ROOT_NAME, None))
    _settings_ref(deps, owner_uid).set(
        {"defaultFolderId": info.id, "defaultFolderName": info.name}, merge=True
    )
    return info.id


def playlist_root(deps: Deps, provider: StorageProvider, pid: str, owner_uid: str) -> str:
    """Per-playlist override > admin's global default location."""
    snap = deps.db.collection("adminPlaylists").document(pid).get()
    override = fget(snap, "storageFolderId") if snap.exists else None
    return override or default_root(deps, provider, owner_uid)


def _cache_ref(deps: Deps, owner_uid: str, key_path: str):
    return deps.db.collection("driveFolders").document(f"{owner_uid}__{sha256_hex(key_path)[:40]}")


def ensure_folder_path(
    deps: Deps,
    provider: StorageProvider,
    owner_uid: str,
    root_id: str,
    segments: list[Segment],
    pid: str | None = None,
) -> str:
    """Idempotently create ``root/seg1/seg2/...`` and return the leaf folder id."""
    parent = root_id
    key_path = ""
    for key, name in segments:
        key_path = f"{key_path}/{key}" if key_path else key
        ref = _cache_ref(deps, owner_uid, key_path)
        cached = ref.get()
        cached_id = None
        if cached.exists and fget(cached, "parentId") == parent:
            cached_id = fget(cached, "folderId")
        info = drive_call(lambda p=parent, n=name, c=cached_id: provider.ensure_folder(p, n, c))
        if info.id != cached_id or not cached.exists:
            ref.set(
                {
                    "folderId": info.id,
                    "parentId": parent,
                    "keyPath": key_path,
                    "entityKey": key,
                    "pid": pid,
                    "ownerUid": owner_uid,
                    "name": safe_name(name),
                }
            )
        parent = info.id
    return parent


def node_chain(deps: Deps, pid: str, nid: str | None) -> list[dict]:
    """Return nodes from the top level down to ``nid`` (inclusive)."""
    chain: list[dict] = []
    seen: set[str] = set()
    nodes = deps.db.collection("playlists").document(pid).collection("nodes")
    while nid and nid not in seen:
        seen.add(nid)
        snap = nodes.document(nid).get()
        if not snap.exists:
            break
        data = snap.to_dict()
        chain.append({"id": nid, **data})
        nid = data.get("parentId")
    return list(reversed(chain))


def content_segments(deps: Deps, pid: str, playlist: dict, nid: str | None) -> list[Segment]:
    segs: list[Segment] = [(f"p:{pid}", playlist.get("title") or "Playlist")]
    segs += [(f"n:{n['id']}", n.get("name") or "Section") for n in node_chain(deps, pid, nid)]
    return segs


def verse_segments(deps: Deps, pid: str, playlist: dict, vid: str, verse: dict) -> list[Segment]:
    return content_segments(deps, pid, playlist, verse.get("nodeId")) + [
        (f"v:{vid}", verse.get("name") or "Verse")
    ]


def user_tag(deps: Deps, uid: str) -> str:
    snap = deps.db.collection("users").document(uid).get()
    name = (fget(snap, "displayName") if snap.exists else None) or "Learner"
    return f"{safe_name(name, 'Learner')}_{uid}"


def learner_segments(deps: Deps, pid: str, playlist: dict, uid: str, vid: str, verse: dict) -> list[Segment]:
    return [
        (f"p:{pid}", playlist.get("title") or "Playlist"),
        ("_Learners", "_Learners"),
        (f"u:{uid}", user_tag(deps, uid)),
        (f"lv:{vid}", verse.get("name") or "Verse"),
    ]


def payment_segments(deps: Deps, pid: str, playlist: dict, uid: str) -> list[Segment]:
    return [
        (f"p:{pid}", playlist.get("title") or "Playlist"),
        ("_Payments", "_Payments"),
        (f"pu:{uid}", user_tag(deps, uid)),
    ]


def rename_cached_folders(deps: Deps, owner_uid: str, entity_key: str, new_name: str) -> int:
    """Keep Drive folder names in sync after a rename in the app (FR-D3)."""
    provider = deps.storage(owner_uid)
    count = 0
    q = deps.db.collection("driveFolders").where(filter=FieldFilter("entityKey", "==", entity_key))
    for snap in q.stream():
        if fget(snap, "ownerUid") != owner_uid:
            continue
        try:
            provider.rename(fget(snap, "folderId"), new_name)
            snap.reference.update({"name": safe_name(new_name)})
            count += 1
        except DriveNotFoundError:
            snap.reference.delete()
    return count


def delete_cached_folders(deps: Deps, owner_uid: str, entity_key: str) -> None:
    provider = deps.storage(owner_uid)
    q = deps.db.collection("driveFolders").where(filter=FieldFilter("entityKey", "==", entity_key))
    for snap in q.stream():
        if fget(snap, "ownerUid") == owner_uid:
            try:
                provider.delete(fget(snap, "folderId"))
            except DriveError:
                pass
            snap.reference.delete()


# ---------------------------------------------------------------------------
# OAuth connect flow
# ---------------------------------------------------------------------------
def drive_auth_url(deps: Deps, caller: Caller | None, _data: Any = None) -> dict:
    caller = require_admin(caller)
    if deps.config.mock_drive:
        return {"mock": True, "url": None}
    if not deps.config.google_oauth_configured:
        raise fail(
            Code.FAILED_PRECONDITION,
            "Google Drive is not configured yet: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see README).",
        )
    state = sign(
        {"u": caller.uid, "n": secrets.token_hex(8), "exp": time.time() + deps.config.oauth_state_ttl_sec},
        deps.config.media_token_secret,
    )
    params = {
        "client_id": deps.config.google_client_id,
        "redirect_uri": deps.config.drive_redirect_uri,
        "response_type": "code",
        "scope": OAUTH_SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
    }
    if caller.email:
        params["login_hint"] = caller.email
    return {"mock": False, "url": f"{OAUTH_AUTH_URI}?{urlencode(params)}"}


def _exchange_code(deps: Deps, code: str) -> dict:
    import requests

    resp = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": deps.config.google_client_id,
            "client_secret": deps.config.google_client_secret,
            "redirect_uri": deps.config.drive_redirect_uri,
            "grant_type": "authorization_code",
        },
        timeout=30,
    )
    if resp.status_code != 200:
        raise DriveError(f"token exchange failed: {resp.status_code}")
    return resp.json()


def drive_oauth_callback(
    deps: Deps,
    code: str | None,
    state: str | None,
    error: str | None = None,
    exchange: Callable[[Deps, str], dict] = _exchange_code,
) -> str:
    """Handle Google's redirect; returns the URL to redirect the browser to."""
    base = f"{deps.config.app_url.rstrip('/')}/admin/settings"
    if error or not code or not state:
        return f"{base}?drive=error"
    try:
        uid = verify(state, deps.config.media_token_secret)["u"]
    except InvalidToken:
        return f"{base}?drive=error"
    admin = deps.db.collection("adminUsers").document(uid).get()
    if not admin.exists or fget(admin, "status") != "active":
        return f"{base}?drive=error"
    try:
        tokens = exchange(deps, code)
    except DriveError:
        return f"{base}?drive=error"
    refresh = tokens.get("refresh_token")
    if not refresh:
        return f"{base}?drive=error"
    deps.db.collection("driveConnections").document(uid).set(
        {
            "refreshTokenEnc": encrypt(refresh, deps.config.token_encryption_key),
            "scope": tokens.get("scope"),
            "status": "connected",
            "connectedAt": deps.now(),
            "updatedAt": deps.now(),
        }
    )
    _settings_ref(deps, uid).set({"driveStatus": "connected", "driveConnectedAt": deps.now()}, merge=True)
    audit(deps, Caller(uid, "ADMIN"), "drive.connect")
    return f"{base}?drive=connected"


def drive_status(deps: Deps, caller: Caller | None, _data: Any = None) -> dict:
    caller = require_admin(caller)
    settings = _settings_ref(deps, caller.uid).get()
    s = settings.to_dict() if settings.exists else {}
    if deps.config.mock_drive:
        return {
            "mock": True,
            "status": "connected",
            "defaultFolderName": s.get("defaultFolderName") or DEFAULT_ROOT_NAME,
        }
    conn = deps.db.collection("driveConnections").document(caller.uid).get()
    return {
        "mock": False,
        "status": fget(conn, "status") if conn.exists else "disconnected",
        "defaultFolderName": s.get("defaultFolderName"),
    }


def drive_disconnect(deps: Deps, caller: Caller | None, _data: Any = None) -> dict:
    caller = require_admin(caller)
    deps.db.collection("driveConnections").document(caller.uid).delete()
    _settings_ref(deps, caller.uid).set({"driveStatus": "disconnected"}, merge=True)
    audit(deps, caller, "drive.disconnect")
    return {"status": "disconnected"}


# ---------------------------------------------------------------------------
# Storage location (Settings + per-playlist override)
# ---------------------------------------------------------------------------
def _resolve_folder(deps: Deps, provider: StorageProvider, req: StorageLocationReq) -> tuple[str, str]:
    if req.folderId:
        info = drive_call(lambda: provider.get_folder(req.folderId))
        return info.id, info.name
    if not req.folderName:
        raise fail(Code.INVALID_ARGUMENT, "Choose a folder (folderId) or give a new folder name.")
    # Create (or reuse) a top-level folder with that name.
    info = drive_call(lambda: provider.find_child_folder(None, req.folderName))
    if info is None:
        info = drive_call(lambda: provider.create_folder(req.folderName, None))
    return info.id, info.name


def set_storage_location(deps: Deps, caller: Caller | None, data: Any) -> dict:
    caller = require_admin(caller)
    req = parse(StorageLocationReq, data)
    if req.scope == "default":
        provider = deps.storage(caller.uid)
        folder_id, name = _resolve_folder(deps, provider, req)
        _settings_ref(deps, caller.uid).set(
            {"defaultFolderId": folder_id, "defaultFolderName": name, "updatedAt": deps.now()}, merge=True
        )
        audit(deps, caller, "storage.default.set", {"folderName": name})
        moved = 0
        if req.moveExisting:
            moved = _move_all_for_owner(deps, caller.uid, provider)
        return {"folderName": name, "moved": moved}

    if not req.playlistId:
        raise fail(Code.INVALID_ARGUMENT, "playlistId is required for a playlist override.")
    owner = owner_of(deps, req.playlistId)
    if owner != caller.uid and not caller.is_super_admin:
        raise fail(Code.PERMISSION_DENIED, "Only the playlist's owner can change where its files are stored.")
    provider = deps.storage(owner)
    ap = deps.db.collection("adminPlaylists").document(req.playlistId)
    if not req.folderId and not req.folderName:
        ap.set({"storageFolderId": None, "storageFolderName": None}, merge=True)
        name = None
    else:
        folder_id, name = _resolve_folder(deps, provider, req)
        ap.set({"storageFolderId": folder_id, "storageFolderName": name}, merge=True)
    audit(deps, caller, "storage.playlist.set", {"playlistId": req.playlistId, "folderName": name})
    moved = move_playlist_files(deps, req.playlistId, owner, provider) if req.moveExisting else 0
    return {"folderName": name, "moved": moved}


def move_playlist_files(deps: Deps, pid: str, owner_uid: str, provider: StorageProvider | None = None) -> int:
    """Move an existing playlist folder (and everything in it) to the current root."""
    provider = provider or deps.storage(owner_uid)
    playlist = get_playlist(deps, pid)
    new_root = playlist_root(deps, provider, pid, owner_uid)
    ref = _cache_ref(deps, owner_uid, f"p:{pid}")
    snap = ref.get()
    if not snap.exists or fget(snap, "parentId") == new_root:
        return 0
    drive_call(lambda: provider.move(fget(snap, "folderId"), new_root))
    ref.update({"parentId": new_root, "name": safe_name(playlist.get("title") or "Playlist")})
    return 1


def _move_all_for_owner(deps: Deps, owner_uid: str, provider: StorageProvider) -> int:
    moved = 0
    q = deps.db.collection("adminPlaylists").where(filter=FieldFilter("ownerUid", "==", owner_uid))
    for snap in q.stream():
        if not fget(snap, "storageFolderId"):
            moved += move_playlist_files(deps, snap.id, owner_uid, provider)
    return moved


def move_storage(deps: Deps, caller: Caller | None, data: Any) -> dict:
    caller = require_admin(caller)
    req = parse(MoveStorageReq, data)
    owner = owner_of(deps, req.playlistId)
    if owner != caller.uid and not caller.is_super_admin:
        raise fail(Code.PERMISSION_DENIED, "Only the playlist's owner can move its files.")
    moved = move_playlist_files(deps, req.playlistId, owner)
    audit(deps, caller, "storage.move", {"playlistId": req.playlistId})
    return {"moved": moved}
