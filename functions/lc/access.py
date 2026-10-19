"""Playlist lookup and learner access checks (free / paid + grant)."""

from __future__ import annotations

from .core import Caller, Code, Deps, fail, fget


def get_playlist(deps: Deps, pid: str) -> dict:
    snap = deps.db.collection("playlists").document(pid).get()
    if not snap.exists:
        raise fail(Code.NOT_FOUND, "Playlist not found.")
    return snap.to_dict()


def owner_of(deps: Deps, pid: str) -> str:
    snap = deps.db.collection("adminPlaylists").document(pid).get()
    if not snap.exists or not fget(snap, "ownerUid"):
        raise fail(Code.FAILED_PRECONDITION, "Playlist has no owner configured.")
    return fget(snap, "ownerUid")


def grant_id(uid: str, pid: str) -> str:
    return f"{uid}_{pid}"


def has_grant(deps: Deps, uid: str, pid: str) -> bool:
    return deps.db.collection("accessGrants").document(grant_id(uid, pid)).get().exists


def has_playlist_access(deps: Deps, caller: Caller, pid: str, playlist: dict | None = None) -> bool:
    if caller.is_admin:
        return True
    playlist = playlist if playlist is not None else get_playlist(deps, pid)
    if not playlist.get("published"):
        return False
    if playlist.get("access", "free") == "free":
        return True
    return has_grant(deps, caller.uid, pid)


def require_playlist_access(deps: Deps, caller: Caller, pid: str, playlist: dict | None = None) -> dict:
    playlist = playlist if playlist is not None else get_playlist(deps, pid)
    if not has_playlist_access(deps, caller, pid, playlist):
        if playlist.get("published") and playlist.get("access") == "paid":
            raise fail(Code.PERMISSION_DENIED, "This playlist is locked until your payment is approved.", {"locked": True})
        raise fail(Code.PERMISSION_DENIED, "You do not have access to this playlist.")
    return playlist


def get_verse(deps: Deps, pid: str, vid: str) -> dict:
    snap = deps.db.collection("playlists").document(pid).collection("verses").document(vid).get()
    if not snap.exists:
        raise fail(Code.NOT_FOUND, "Verse not found.")
    return snap.to_dict()
