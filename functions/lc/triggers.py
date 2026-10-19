"""Firestore trigger logic: verse counts, progress totals, Drive housekeeping."""

from __future__ import annotations

from google.cloud.firestore_v1.base_query import FieldFilter

from .access import owner_of
from .core import Deps, log, fget
from .review import recompute_user_progress
from .storage import delete_cached_folders, rename_cached_folders
from .uploads import delete_media


def recount(deps: Deps, pid: str) -> int:
    """Recompute ``verseCount`` on the playlist and every node (descendant totals)."""
    pref = deps.db.collection("playlists").document(pid)
    if not pref.get().exists:
        return 0
    nodes = {s.id: s.to_dict() for s in pref.collection("nodes").stream()}
    counts = {nid: 0 for nid in nodes}
    total = 0
    for v in pref.collection("verses").stream():
        total += 1
        nid, seen = fget(v, "nodeId"), set()
        while nid and nid in nodes and nid not in seen:
            seen.add(nid)
            counts[nid] += 1
            nid = nodes[nid].get("parentId")
    batch = deps.db.batch()
    for nid, count in counts.items():
        if nodes[nid].get("verseCount") != count:
            batch.update(pref.collection("nodes").document(nid), {"verseCount": count})
    batch.update(pref, {"verseCount": total})
    batch.commit()
    for prog in deps.db.collection_group("progress").where(filter=FieldFilter("pid", "==", pid)).stream():
        if fget(prog, "totalCount") != total:
            prog.reference.update({"totalCount": total})
    return total


def _progress_uids(deps: Deps, pid: str) -> list[str]:
    q = deps.db.collection_group("progress").where(filter=FieldFilter("pid", "==", pid))
    return [fget(s, "uid") for s in q.stream() if fget(s, "uid")]


def _safe_owner(deps: Deps, pid: str) -> str | None:
    try:
        return owner_of(deps, pid)
    except Exception:  # noqa: BLE001 - playlist may already be gone
        return None


def on_verse_written(deps: Deps, pid: str, vid: str, before: dict | None, after: dict | None) -> None:
    structural = before is None or after is None or before.get("nodeId") != after.get("nodeId")
    if structural:
        recount(deps, pid)
    owner = _safe_owner(deps, pid)
    if after is None:
        verse_ref = deps.db.collection("playlists").document(pid).collection("verses").document(vid)
        for m in verse_ref.collection("media").stream():
            delete_media(deps, m.id)
            m.reference.delete()
        if owner:
            try:
                delete_cached_folders(deps, owner, f"v:{vid}")
            except Exception as exc:  # noqa: BLE001
                log("trigger.cleanup_failed", error=str(exc))
    elif before is not None and owner and before.get("name") != after.get("name"):
        try:
            rename_cached_folders(deps, owner, f"v:{vid}", after.get("name") or "Verse")
            rename_cached_folders(deps, owner, f"lv:{vid}", after.get("name") or "Verse")
        except Exception as exc:  # noqa: BLE001
            log("trigger.rename_failed", error=str(exc))
    if structural and before is not None:
        for uid in _progress_uids(deps, pid):
            recompute_user_progress(deps, uid, pid)


def on_node_written(deps: Deps, pid: str, nid: str, before: dict | None, after: dict | None) -> None:
    owner = _safe_owner(deps, pid)
    moved = before is not None and (after is None or before.get("parentId") != after.get("parentId"))
    if moved:
        recount(deps, pid)
        for uid in _progress_uids(deps, pid):
            recompute_user_progress(deps, uid, pid)
    if not owner:
        return
    try:
        if after is None:
            delete_cached_folders(deps, owner, f"n:{nid}")
        elif before is not None and before.get("name") != after.get("name"):
            rename_cached_folders(deps, owner, f"n:{nid}", after.get("name") or "Section")
    except Exception as exc:  # noqa: BLE001
        log("trigger.node_drive_failed", error=str(exc))


def on_playlist_written(deps: Deps, pid: str, before: dict | None, after: dict | None) -> None:
    if before is None or after is None or before.get("title") == after.get("title"):
        return
    owner = _safe_owner(deps, pid)
    if owner:
        try:
            rename_cached_folders(deps, owner, f"p:{pid}", after.get("title") or "Playlist")
        except Exception as exc:  # noqa: BLE001
            log("trigger.playlist_rename_failed", error=str(exc))
