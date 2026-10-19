"""Resumable uploads straight from the browser to Drive.

``create_upload_session`` resolves and creates the mirrored target folder, then
asks the storage provider for a resumable session URI. File bytes never pass
through functions (except in mock mode, where ``/mock-upload`` emulates the Drive
resumable protocol on local disk). ``finalize_upload`` locates the uploaded file
via its ``mediaId`` app property and records metadata.
"""

from __future__ import annotations

import re
import secrets
from datetime import datetime
from typing import Any
from urllib.parse import urlparse

from google.cloud import firestore

from drive import DriveError, DriveNotFoundError
from drive.base import safe_name

from .access import get_playlist, get_verse, owner_of, require_playlist_access
from .core import Caller, Code, Deps, day_key, fail, parse, require_auth, fget
from .models import FinalizeUploadReq, UploadSessionReq
from .storage import (
    content_segments,
    drive_call,
    ensure_folder_path,
    learner_segments,
    payment_segments,
    playlist_root,
    verse_segments,
)

ADMIN_PURPOSES = {"verse_audio", "verse_video", "material", "reply"}

_EXT = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "video/webm": "webm",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "text/plain": "txt",
}

_MIME_RE = re.compile(r"^[a-z]+/[a-z0-9.+-]+$")


def base_mime(mime: str) -> str:
    return mime.split(";", 1)[0].strip().lower()


def ext_for(mime: str, file_name: str | None = None) -> str:
    if file_name and "." in file_name:
        return file_name.rsplit(".", 1)[-1].lower()[:8]
    return _EXT.get(base_mime(mime), "bin")


def _check_mime(req: UploadSessionReq, deps: Deps) -> tuple[str, str | None]:
    mime = base_mime(req.mimeType)
    if not _MIME_RE.match(mime):
        raise fail(Code.INVALID_ARGUMENT, "Unsupported file type.")
    kind: str | None = None
    if req.purpose in {"verse_audio", "verse_video", "submission", "reply"}:
        kind = {"verse_audio": "audio", "verse_video": "video"}.get(req.purpose) or req.kind or mime.split("/")[0]
        if kind not in {"audio", "video"}:
            raise fail(Code.INVALID_ARGUMENT, "Only audio or video recordings are accepted.")
        # Some browsers record audio-only into a video/webm container; accept that.
        if not (mime.startswith(kind + "/") or (kind == "audio" and mime == "video/webm")):
            raise fail(Code.INVALID_ARGUMENT, f"Expected an {kind} file.")
        limit = deps.config.max_video_bytes if kind == "video" else deps.config.max_audio_bytes
    elif req.purpose == "payment_screenshot":
        if not mime.startswith("image/"):
            raise fail(Code.INVALID_ARGUMENT, "The payment screenshot must be an image.")
        limit = 10 * 1024 * 1024
    else:  # material
        allowed = mime == "application/pdf" or mime.split("/")[0] in {"image", "text", "audio", "video"}
        if not allowed:
            raise fail(Code.INVALID_ARGUMENT, "Materials must be PDF, image, text, audio or video files.")
        limit = deps.config.max_video_bytes if mime.split("/")[0] in {"audio", "video"} else deps.config.max_doc_bytes
    if req.size > limit:
        raise fail(Code.INVALID_ARGUMENT, f"File is too large (max {limit // (1024 * 1024)} MB).")
    return mime, kind


def _stamp(dt: datetime) -> str:
    return dt.strftime("%Y%m%d-%H%M%S")


def create_upload_session(deps: Deps, caller: Caller | None, data: Any, origin: str | None = None) -> dict:
    caller = require_auth(caller)
    req = parse(UploadSessionReq, data)
    if req.purpose in ADMIN_PURPOSES and not caller.is_admin:
        raise fail(Code.PERMISSION_DENIED, "Admin access required.")
    mime, kind = _check_mime(req, deps)
    pid = req.playlistId
    playlist = get_playlist(deps, pid)
    owner = owner_of(deps, pid)
    record: dict[str, Any] = {
        "purpose": req.purpose,
        "pid": pid,
        "kind": kind,
        "mimeType": mime,
        "declaredSize": req.size,
        "ownerUid": owner,
        "uploaderUid": caller.uid,
        "status": "pending",
        "createdAt": deps.now(),
    }

    if req.purpose in {"verse_audio", "verse_video"}:
        if not req.verseId:
            raise fail(Code.INVALID_ARGUMENT, "verseId is required.")
        verse = get_verse(deps, pid, req.verseId)
        segments = verse_segments(deps, pid, playlist, req.verseId, verse) + [(kind, kind)]
        file_name = f"{kind}.{ext_for(mime)}"
        record["vid"] = req.verseId
    elif req.purpose == "material":
        if not req.materialId:
            raise fail(Code.INVALID_ARGUMENT, "materialId is required.")
        mat = deps.db.collection("playlists").document(pid).collection("materials").document(req.materialId).get()
        if not mat.exists:
            raise fail(Code.NOT_FOUND, "Material not found.")
        segments = content_segments(deps, pid, playlist, fget(mat, "nodeId")) + [("materials", "materials")]
        stem = safe_name((req.fileName or fget(mat, "title") or "material").rsplit(".", 1)[0], "material")
        file_name = f"{stem}.{ext_for(mime, req.fileName)}"
        record["materialId"] = req.materialId
    elif req.purpose == "submission":
        if not req.verseId:
            raise fail(Code.INVALID_ARGUMENT, "verseId is required.")
        require_playlist_access(deps, caller, pid, playlist)
        verse = get_verse(deps, pid, req.verseId)
        segments = learner_segments(deps, pid, playlist, caller.uid, req.verseId, verse)
        file_name = f"{_stamp(deps.now())}.{ext_for(mime)}"
        record["vid"] = req.verseId
    elif req.purpose == "reply":
        if not req.submissionId:
            raise fail(Code.INVALID_ARGUMENT, "submissionId is required.")
        sub = deps.db.collection("submissions").document(req.submissionId).get()
        if not sub.exists or fget(sub, "pid") != pid:
            raise fail(Code.NOT_FOUND, "Submission not found.")
        verse = get_verse(deps, pid, fget(sub, "vid"))
        segments = learner_segments(deps, pid, playlist, fget(sub, "uid"), fget(sub, "vid"), verse) + [
            ("replies", "replies")
        ]
        file_name = f"reply-{_stamp(deps.now())}.{ext_for(mime)}"
        record["submissionId"] = req.submissionId
        record["learnerUid"] = fget(sub, "uid")
    else:  # payment_screenshot
        if not playlist.get("published") or playlist.get("access") != "paid":
            raise fail(Code.FAILED_PRECONDITION, "This playlist does not require payment.")
        segments = payment_segments(deps, pid, playlist, caller.uid)
        file_name = f"payment-{_stamp(deps.now())}.{ext_for(mime, req.fileName)}"

    provider = deps.storage(owner)
    root = playlist_root(deps, provider, pid, owner)
    folder_id = ensure_folder_path(deps, provider, owner, root, segments, pid=pid)
    media_id = "m" + secrets.token_hex(12)
    origin = origin or deps.config.app_url
    parsed = urlparse(origin)
    origin = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else deps.config.app_url

    session = drive_call(
        lambda: provider.create_upload_session(
            parent_id=folder_id,
            name=file_name,
            mime_type=mime,
            size=req.size,
            app_properties={"mediaId": media_id, "app": "learnchants"},
            origin=origin,
        )
    )
    record.update({"folderId": folder_id, "fileName": file_name})
    deps.db.collection("driveFiles").document(media_id).set(record)
    upload_url = f"/mock-upload/{session.session}" if session.is_mock else session.session
    return {"mediaId": media_id, "uploadUrl": upload_url, "chunkSize": 4 * 1024 * 1024}


# ---------------------------------------------------------------------------
def _replace_verse_media(deps: Deps, pid: str, vid: str, kind: str, keep_media_id: str) -> None:
    verse_ref = deps.db.collection("playlists").document(pid).collection("verses").document(vid)
    old_id = (verse_ref.get().to_dict() or {}).get(f"{kind}MediaId")
    if not old_id or old_id == keep_media_id:
        return
    delete_media(deps, old_id)
    verse_ref.collection("media").document(old_id).delete()


def delete_media(deps: Deps, media_id: str) -> None:
    """Remove a stored file (best effort) and its ``driveFiles`` record."""
    ref = deps.db.collection("driveFiles").document(media_id)
    snap = ref.get()
    if not snap.exists:
        return
    rec = snap.to_dict()
    if rec.get("driveFileId"):
        try:
            deps.storage(rec["ownerUid"]).delete(rec["driveFileId"])
        except (DriveError, Exception):  # noqa: BLE001 - cleanup is best effort
            pass
    ref.delete()


def record_activity(deps: Deps, uid: str) -> None:
    deps.db.collection("users").document(uid).collection("meta").document("stats").set(
        {"activityDays": firestore.ArrayUnion([day_key(deps.now())]), "lastActiveAt": deps.now()}, merge=True
    )


def ensure_progress(deps: Deps, uid: str, pid: str, playlist: dict) -> Any:
    ref = deps.db.collection("users").document(uid).collection("progress").document(pid)
    if not ref.get().exists:
        ref.set(
            {
                "pid": pid,
                "uid": uid,
                "title": playlist.get("title"),
                "approvedCount": 0,
                "totalCount": playlist.get("verseCount", 0),
                "nodeApproved": {},
                "startedAt": deps.now(),
                "updatedAt": deps.now(),
            }
        )
    return ref


def finalize_upload(deps: Deps, caller: Caller | None, data: Any) -> dict:
    caller = require_auth(caller)
    req = parse(FinalizeUploadReq, data)
    ref = deps.db.collection("driveFiles").document(req.mediaId)
    snap = ref.get()
    if not snap.exists:
        raise fail(Code.NOT_FOUND, "Upload not found.")
    rec = snap.to_dict()
    if rec["uploaderUid"] != caller.uid:
        raise fail(Code.PERMISSION_DENIED, "Not your upload.")
    if rec["status"] != "pending":
        return {"mediaId": req.mediaId, "submissionId": rec.get("submissionId")}

    provider = deps.storage(rec["ownerUid"])
    info = drive_call(lambda: provider.find_by_app_property(rec["folderId"], "mediaId", req.mediaId))
    if info is None:
        raise fail(Code.FAILED_PRECONDITION, "The upload has not completed yet.")
    if info.size > rec["declaredSize"] * 1.05 + 1024:
        try:
            provider.delete(info.id)
        except DriveNotFoundError:
            pass
        ref.delete()
        raise fail(Code.INVALID_ARGUMENT, "Uploaded file is larger than declared.")

    now = deps.now()
    ref.update({"driveFileId": info.id, "size": info.size, "status": "ready", "durationSec": req.durationSec, "readyAt": now})
    pid = rec["pid"]
    purpose = rec["purpose"]
    playlist_ref = deps.db.collection("playlists").document(pid)
    result: dict[str, Any] = {"mediaId": req.mediaId}

    if purpose in {"verse_audio", "verse_video"}:
        kind = rec["kind"]
        vid = rec["vid"]
        _replace_verse_media(deps, pid, vid, kind, req.mediaId)
        verse_ref = playlist_ref.collection("verses").document(vid)
        verse_ref.collection("media").document(req.mediaId).set(
            {"kind": kind, "mimeType": rec["mimeType"], "durationSec": req.durationSec, "sizeBytes": info.size, "createdAt": now}
        )
        verse_ref.update(
            {
                f"{kind}MediaId": req.mediaId,
                f"has{kind.capitalize()}": True,
                f"{kind}Mime": rec["mimeType"],
                "updatedAt": now,
            }
        )
    elif purpose == "material":
        mat_ref = playlist_ref.collection("materials").document(rec["materialId"])
        old = (mat_ref.get().to_dict() or {}).get("mediaId")
        if old and old != req.mediaId:
            delete_media(deps, old)
        mat_ref.update({"mediaId": req.mediaId, "mimeType": rec["mimeType"], "sizeBytes": info.size, "status": "ready", "updatedAt": now})
    elif purpose == "submission":
        playlist = get_playlist(deps, pid)
        verse = get_verse(deps, pid, rec["vid"])
        user = deps.db.collection("users").document(caller.uid).get()
        _, sub_ref = deps.db.collection("submissions").add(
            {
                "uid": caller.uid,
                "userName": fget(user, "displayName") if user.exists else None,
                "pid": pid,
                "vid": rec["vid"],
                "nodeId": verse.get("nodeId"),
                "playlistTitle": playlist.get("title"),
                "verseName": verse.get("name"),
                "kind": rec["kind"],
                "mediaId": req.mediaId,
                "mimeType": rec["mimeType"],
                "durationSec": req.durationSec,
                "status": "SUBMITTED",
                "replyCount": 0,
                "createdAt": now,
                "updatedAt": now,
            }
        )
        ref.update({"submissionId": sub_ref.id})
        progress = ensure_progress(deps, caller.uid, pid, playlist)
        vs_ref = progress.collection("verseStatus").document(rec["vid"])
        vs = vs_ref.get()
        if not vs.exists or fget(vs, "status") != "APPROVED":
            vs_ref.set(
                {"status": "SUBMITTED", "pid": pid, "nodeId": verse.get("nodeId"), "lastSubmissionId": sub_ref.id, "updatedAt": now},
                merge=True,
            )
        progress.update({"updatedAt": now, "lastVerseId": rec["vid"]})
        record_activity(deps, caller.uid)
        result["submissionId"] = sub_ref.id
    return result


# ---------------------------------------------------------------------------
# Mock resumable endpoint (MOCK_DRIVE only)
# ---------------------------------------------------------------------------
_RANGE_RE = re.compile(r"^bytes (\*|(\d+)-(\d+))/(\*|\d+)$")


def mock_upload(deps: Deps, session_id: str, content_range: str | None, body: bytes) -> tuple[int, dict, str]:
    """Emulate Drive's resumable PUT protocol: 308 + ``Range`` while incomplete, 200 when done."""
    if not deps.config.mock_drive:
        return 404, {}, "not found"
    from drive.mock import LocalMockProvider

    provider = LocalMockProvider(deps.config.mock_drive_root)
    try:
        received = provider.session_received(session_id)
    except DriveNotFoundError:
        return 404, {}, "unknown upload session"
    total: int | None = None
    start = received
    if content_range:
        m = _RANGE_RE.match(content_range.strip())
        if not m:
            return 400, {}, "bad Content-Range"
        total = None if m.group(4) == "*" else int(m.group(4))
        if m.group(1) == "*":  # status query
            headers = {"Range": f"bytes=0-{received - 1}"} if received else {}
            return 308, headers, ""
        start = int(m.group(2))
    else:
        total = len(body)
    try:
        info = provider.write_chunk(session_id, start, body, total)
    except DriveError:
        return 308, ({"Range": f"bytes=0-{received - 1}"} if received else {}), ""
    if info is None:
        return 308, {"Range": f"bytes=0-{provider.session_received(session_id) - 1}"}, ""
    return 200, {"Content-Type": "application/json"}, '{"ok":true}'
