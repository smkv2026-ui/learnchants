"""Signed, short-lived media URLs and Range-capable streaming.

Clients never see Drive ids or links: ``get_media_url`` checks access and
returns ``/media/<signed token>``; ``stream_media`` validates the token and
proxies bytes from the storage provider with HTTP Range support.
"""

from __future__ import annotations

import itertools
import re
import time
from typing import Any, Iterator

from .access import has_playlist_access
from .core import Caller, Code, Deps, fail, parse, require_auth, fget
from .crypto import InvalidToken, sign, verify
from .models import MediaUrlReq
from .storage import drive_call


def _can_read(deps: Deps, caller: Caller, rec: dict) -> bool:
    if caller.is_admin:
        return True
    purpose = rec.get("purpose")
    if purpose in {"verse_audio", "verse_video", "material"}:
        return has_playlist_access(deps, caller, rec["pid"])
    if purpose in {"submission", "payment_screenshot"}:
        return rec.get("uploaderUid") == caller.uid
    if purpose == "reply":
        return rec.get("learnerUid") == caller.uid
    return False


def get_media_url(deps: Deps, caller: Caller | None, data: Any) -> dict:
    caller = require_auth(caller)
    req = parse(MediaUrlReq, data)
    snap = deps.db.collection("driveFiles").document(req.mediaId).get()
    if not snap.exists or fget(snap, "status") != "ready":
        raise fail(Code.NOT_FOUND, "Media not found.")
    rec = snap.to_dict()
    if not _can_read(deps, caller, rec):
        locked = rec.get("purpose") in {"verse_audio", "verse_video", "material"}
        raise fail(
            Code.PERMISSION_DENIED,
            "This content is locked until your payment is approved." if locked else "Access denied.",
            {"locked": locked},
        )
    exp = int(time.time()) + deps.config.media_token_ttl_sec
    token = sign({"m": req.mediaId, "u": caller.uid, "exp": exp}, deps.config.media_token_secret)
    return {"url": f"/media/{token}", "expiresAt": exp, "mimeType": rec.get("mimeType")}


_RANGE = re.compile(r"^bytes=(\d*)-(\d*)$")


def parse_range(header: str | None, size: int) -> tuple[int, int] | None:
    """Return inclusive (start, end) or None for a full response. Raises ValueError if unsatisfiable."""
    if not header:
        return None
    m = _RANGE.match(header.strip().split(",")[0].strip())
    if not m or (m.group(1) == "" and m.group(2) == ""):
        return None
    if m.group(1) == "":  # suffix range: last N bytes
        n = int(m.group(2))
        if n == 0:
            raise ValueError("unsatisfiable")
        return max(0, size - n), size - 1
    start = int(m.group(1))
    end = int(m.group(2)) if m.group(2) else size - 1
    if start >= size or start > end:
        raise ValueError("unsatisfiable")
    return start, min(end, size - 1)


def stream_media(deps: Deps, token: str, range_header: str | None) -> tuple[int, dict, Iterator[bytes] | bytes]:
    try:
        payload = verify(token, deps.config.media_token_secret)
    except (InvalidToken, ValueError):
        return 403, {"Content-Type": "text/plain"}, b"Link expired or invalid."
    snap = deps.db.collection("driveFiles").document(payload["m"]).get()
    if not snap.exists or fget(snap, "status") != "ready":
        return 404, {"Content-Type": "text/plain"}, b"Not found."
    rec = snap.to_dict()
    size = int(rec.get("size") or 0)
    headers = {
        "Content-Type": rec.get("mimeType") or "application/octet-stream",
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=600",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
    }
    try:
        rng = parse_range(range_header, size)
    except ValueError:
        return 416, {**headers, "Content-Range": f"bytes */{size}"}, b""
    provider = deps.storage(rec["ownerUid"])
    if rng is None:
        start, end, status = 0, size - 1, 200
    else:
        (start, end), status = rng, 206
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    headers["Content-Length"] = str(max(0, end - start + 1))
    if size == 0:
        return 200, headers, b""

    def _open() -> tuple[bytes, Iterator[bytes]]:
        gen = provider.open_range(rec["driveFileId"], start, end)
        return next(gen, b""), gen  # pull the first chunk so errors surface here

    first, rest = drive_call(_open)
    return status, headers, itertools.chain([first], rest)
