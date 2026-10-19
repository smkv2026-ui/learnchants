"""Teacher review of learner submissions and progress roll-ups."""

from __future__ import annotations

from typing import Any

from google.cloud import firestore

from .access import get_playlist
from .core import Caller, Code, Deps, audit, fail, notify, parse, require_admin, fget
from .models import ReviewSubmissionReq
from .storage import node_chain
from .uploads import ensure_progress

TEACHER_LABEL = "Your Teacher"


def review_submission(deps: Deps, caller: Caller | None, data: Any) -> dict:
    caller = require_admin(caller)
    req = parse(ReviewSubmissionReq, data)
    sub_ref = deps.db.collection("submissions").document(req.submissionId)
    snap = sub_ref.get()
    if not snap.exists:
        raise fail(Code.NOT_FOUND, "Submission not found.")
    sub = snap.to_dict()
    if req.status == "NEEDS_WORK" and not (req.text or req.replyMediaId):
        raise fail(Code.INVALID_ARGUMENT, "Add a correction (text or recording) when asking for more work.")

    reply_kind = None
    if req.replyMediaId:
        media = deps.db.collection("driveFiles").document(req.replyMediaId).get()
        if (
            not media.exists
            or fget(media, "purpose") != "reply"
            or fget(media, "submissionId") != req.submissionId
            or fget(media, "status") != "ready"
        ):
            raise fail(Code.INVALID_ARGUMENT, "Invalid reply recording.")
        reply_kind = fget(media, "kind")

    now = deps.now()
    # Replies carry no author: learners only ever see the generic teacher label.
    sub_ref.collection("replies").add(
        {
            "text": (req.text or "").strip() or None,
            "mediaId": req.replyMediaId,
            "kind": reply_kind,
            "status": req.status,
            "authorLabel": TEACHER_LABEL,
            "createdAt": now,
        }
    )
    sub_ref.update(
        {"status": req.status, "updatedAt": now, "lastReplyAt": now, "replyCount": firestore.Increment(1)}
    )

    uid, pid, vid = sub["uid"], sub["pid"], sub["vid"]
    playlist = get_playlist(deps, pid)
    progress = ensure_progress(deps, uid, pid, playlist)
    vs_ref = progress.collection("verseStatus").document(vid)
    vs = vs_ref.get()
    prev = fget(vs, "status") if vs.exists else None
    vs_ref.set(
        {"status": req.status, "pid": pid, "nodeId": sub.get("nodeId"), "lastSubmissionId": req.submissionId, "updatedAt": now},
        merge=True,
    )

    delta = 0
    if req.status == "APPROVED" and prev != "APPROVED":
        delta = 1
    elif req.status != "APPROVED" and prev == "APPROVED":
        delta = -1
    celebrate: list[str] = []
    if delta:
        chain = node_chain(deps, pid, sub.get("nodeId"))
        update: dict[str, Any] = {"approvedCount": firestore.Increment(delta), "updatedAt": now}
        for node in chain:
            update[f"nodeApproved.{node['id']}"] = firestore.Increment(delta)
        progress.update(update)
        if delta > 0:
            after = progress.get().to_dict() or {}
            approved_map = after.get("nodeApproved", {})
            for node in reversed(chain):
                total = node.get("verseCount") or 0
                if total and approved_map.get(node["id"], 0) >= total:
                    celebrate.append(f"section:{node['id']}")
            total = playlist.get("verseCount") or 0
            if total and after.get("approvedCount", 0) >= total:
                celebrate.append("playlist")

    verse_name = sub.get("verseName") or "your verse"
    link = f"/p/{pid}/v/{vid}"
    if req.status == "APPROVED":
        notify(deps, uid, "approved", f"{TEACHER_LABEL} approved your chanting of “{verse_name}”. Wonderful!", link)
        if "playlist" in celebrate:
            notify(deps, uid, "playlist_complete", f"You completed “{playlist.get('title')}”! 🎉", f"/p/{pid}")
        elif any(c.startswith("section:") for c in celebrate):
            notify(deps, uid, "section_complete", "You completed a section! Keep going. 🎉", link)
    else:
        notify(deps, uid, "needs_work", f"{TEACHER_LABEL} sent corrections for “{verse_name}”.", link)

    audit(deps, caller, f"submission.{req.status.lower()}", {"submissionId": req.submissionId, "uid": uid, "pid": pid, "vid": vid})
    return {"status": req.status, "celebrate": celebrate}


def recompute_user_progress(deps: Deps, uid: str, pid: str) -> None:
    """Rebuild ``approvedCount``/``nodeApproved`` from verse statuses and the current tree."""
    progress = deps.db.collection("users").document(uid).collection("progress").document(pid)
    if not progress.get().exists:
        return
    verses = {s.id: s.to_dict() for s in deps.db.collection("playlists").document(pid).collection("verses").stream()}
    nodes = {s.id: s.to_dict() for s in deps.db.collection("playlists").document(pid).collection("nodes").stream()}
    approved = 0
    node_approved: dict[str, int] = {}
    for vs in progress.collection("verseStatus").stream():
        verse = verses.get(vs.id)
        if verse is None:
            vs.reference.delete()
            continue
        if fget(vs, "nodeId") != verse.get("nodeId"):
            vs.reference.update({"nodeId": verse.get("nodeId")})
        if fget(vs, "status") != "APPROVED":
            continue
        approved += 1
        nid, seen = verse.get("nodeId"), set()
        while nid and nid in nodes and nid not in seen:
            seen.add(nid)
            node_approved[nid] = node_approved.get(nid, 0) + 1
            nid = nodes[nid].get("parentId")
    progress.update(
        {"approvedCount": approved, "nodeApproved": node_approved, "totalCount": len(verses), "updatedAt": deps.now()}
    )
