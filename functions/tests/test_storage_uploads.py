import pytest
from firebase_functions.https_fn import HttpsError

from lc import storage, uploads

from .conftest import ADMIN, LEARNER, SUPER, seed_playlist, upload
from .test_admins import code


def test_verse_audio_lands_in_mirrored_folder(deps):
    seed_playlist(deps)
    res = upload(deps, SUPER, {"purpose": "verse_audio", "playlistId": "rudram", "verseId": "v1", "mimeType": "audio/webm;codecs=opus"}, chunk=300)
    root = deps.config.mock_drive_root
    assert (root / "LearnChants/Sri Rudram/Namakam/Anuvakam 1/Verse 1/audio/audio.webm").is_file()
    verse = deps.db.data("playlists/rudram/verses/v1")
    assert verse["hasAudio"] is True and verse["audioMediaId"] == res["mediaId"]
    media = deps.db.data(f"playlists/rudram/verses/v1/media/{res['mediaId']}")
    assert media == {"kind": "audio", "mimeType": "audio/webm", "durationSec": 3.0, "sizeBytes": 1000, "createdAt": deps.now()}


def test_video_upload_replaces_previous(deps):
    seed_playlist(deps)
    first = upload(deps, ADMIN, {"purpose": "verse_video", "playlistId": "rudram", "verseId": "v2", "mimeType": "video/mp4"})
    second = upload(deps, ADMIN, {"purpose": "verse_video", "playlistId": "rudram", "verseId": "v2", "mimeType": "video/mp4"})
    assert deps.db.data(f"driveFiles/{first['mediaId']}") is None
    assert deps.db.data(f"playlists/rudram/verses/v2/media/{first['mediaId']}") is None
    assert deps.db.data("playlists/rudram/verses/v2")["videoMediaId"] == second["mediaId"]
    folder = deps.config.mock_drive_root / "LearnChants/Sri Rudram/Namakam/Anuvakam 1/Verse 2/video"
    assert len(list(folder.iterdir())) == 1  # old file removed


def test_learner_cannot_upload_verse_media(deps):
    seed_playlist(deps)
    with pytest.raises(HttpsError) as e:
        uploads.create_upload_session(deps, LEARNER, {"purpose": "verse_audio", "playlistId": "rudram", "verseId": "v1", "mimeType": "audio/webm", "size": 10})
    assert code(e) == "permission-denied"


def test_rejects_wrong_type_and_oversize(deps):
    seed_playlist(deps)
    with pytest.raises(HttpsError):
        uploads.create_upload_session(deps, SUPER, {"purpose": "verse_audio", "playlistId": "rudram", "verseId": "v1", "mimeType": "application/pdf", "size": 10})
    with pytest.raises(HttpsError):
        uploads.create_upload_session(deps, SUPER, {"purpose": "verse_audio", "playlistId": "rudram", "verseId": "v1", "mimeType": "audio/webm", "size": 10**10})


def test_finalize_before_upload_complete_fails(deps):
    seed_playlist(deps)
    res = uploads.create_upload_session(deps, SUPER, {"purpose": "verse_audio", "playlistId": "rudram", "verseId": "v1", "mimeType": "audio/webm", "size": 10})
    with pytest.raises(HttpsError) as e:
        uploads.finalize_upload(deps, SUPER, {"mediaId": res["mediaId"]})
    assert code(e) == "failed-precondition"
    with pytest.raises(HttpsError) as e:
        uploads.finalize_upload(deps, ADMIN, {"mediaId": res["mediaId"]})
    assert code(e) == "permission-denied"


def test_mock_upload_status_query(deps):
    seed_playlist(deps)
    res = uploads.create_upload_session(deps, SUPER, {"purpose": "verse_audio", "playlistId": "rudram", "verseId": "v1", "mimeType": "audio/webm", "size": 10})
    sid = res["uploadUrl"].rsplit("/", 1)[-1]
    assert uploads.mock_upload(deps, sid, "bytes 0-3/10", b"abcd")[0] == 308
    status, headers, _ = uploads.mock_upload(deps, sid, "bytes */10", b"")
    assert status == 308 and headers["Range"] == "bytes=0-3"
    assert uploads.mock_upload(deps, "nope", "bytes */10", b"")[0] == 404


def test_learner_submission_goes_to_learners_folder(deps):
    seed_playlist(deps)
    res = upload(deps, LEARNER, {"purpose": "submission", "playlistId": "rudram", "verseId": "v1", "mimeType": "audio/webm", "kind": "audio"})
    folder = deps.config.mock_drive_root / "LearnChants/Sri Rudram/_Learners/Asha_learner1/Verse 1"
    assert len(list(folder.iterdir())) == 1
    sub = deps.db.data(f"submissions/{res['submissionId']}")
    assert sub["status"] == "SUBMITTED" and sub["uid"] == LEARNER.uid
    assert deps.db.data("users/learner1/progress/rudram/verseStatus/v1")["status"] == "SUBMITTED"
    assert deps.db.data("users/learner1/progress/rudram")["totalCount"] == 3
    assert deps.db.data("users/learner1/meta/stats")["activityDays"] == ["2026-10-19"]


def test_paid_playlist_submission_locked(deps):
    seed_playlist(deps, access="paid", price=499)
    with pytest.raises(HttpsError) as e:
        uploads.create_upload_session(deps, LEARNER, {"purpose": "submission", "playlistId": "rudram", "verseId": "v1", "mimeType": "audio/webm", "size": 10})
    assert code(e) == "permission-denied"


def test_storage_location_change_and_playlist_override(deps):
    seed_playlist(deps)
    root = deps.config.mock_drive_root
    upload(deps, SUPER, {"purpose": "verse_audio", "playlistId": "rudram", "verseId": "v1", "mimeType": "audio/webm"})
    # change the global default: new content goes to the new folder
    res = storage.set_storage_location(deps, SUPER, {"scope": "default", "folderName": "Chants 2026"})
    assert res["folderName"] == "Chants 2026"
    upload(deps, SUPER, {"purpose": "verse_audio", "playlistId": "rudram", "verseId": "v2", "mimeType": "audio/webm"})
    assert (root / "Chants 2026/Sri Rudram/Namakam/Anuvakam 1/Verse 2/audio/audio.webm").is_file()
    assert (root / "LearnChants/Sri Rudram/Namakam/Anuvakam 1/Verse 1/audio/audio.webm").is_file()
    # per-playlist override
    storage.set_storage_location(deps, SUPER, {"scope": "playlist", "playlistId": "rudram", "folderName": "Rudram Only"})
    upload(deps, SUPER, {"purpose": "verse_audio", "playlistId": "rudram", "verseId": "v3", "mimeType": "audio/webm"})
    assert (root / "Rudram Only/Sri Rudram/Namakam/Anuvakam 2/Verse 1/audio/audio.webm").is_file()
    # move existing files into the override location
    moved = storage.move_storage(deps, SUPER, {"playlistId": "rudram"})
    assert moved == {"moved": 0}  # playlist folder in this root already exists, latest cache points here


def test_move_existing_files(deps):
    seed_playlist(deps)
    root = deps.config.mock_drive_root
    upload(deps, SUPER, {"purpose": "verse_audio", "playlistId": "rudram", "verseId": "v1", "mimeType": "audio/webm"})
    res = storage.set_storage_location(deps, SUPER, {"scope": "playlist", "playlistId": "rudram", "folderName": "Moved", "moveExisting": True})
    assert res["moved"] == 1
    assert (root / "Moved/Sri Rudram/Namakam/Anuvakam 1/Verse 1/audio/audio.webm").is_file()
    assert not (root / "LearnChants/Sri Rudram").exists()
    # subsequent uploads reuse the moved folders
    upload(deps, SUPER, {"purpose": "verse_audio", "playlistId": "rudram", "verseId": "v2", "mimeType": "audio/webm"})
    assert (root / "Moved/Sri Rudram/Namakam/Anuvakam 1/Verse 2/audio/audio.webm").is_file()


def test_playlist_override_owner_only(deps):
    seed_playlist(deps)
    with pytest.raises(HttpsError) as e:
        storage.set_storage_location(deps, ADMIN, {"scope": "playlist", "playlistId": "rudram", "folderName": "X"})
    assert code(e) == "permission-denied"


def test_rename_keeps_drive_in_sync(deps):
    from lc import triggers

    seed_playlist(deps)
    root = deps.config.mock_drive_root
    upload(deps, SUPER, {"purpose": "verse_audio", "playlistId": "rudram", "verseId": "v1", "mimeType": "audio/webm"})
    deps.db.document("playlists/rudram/nodes/anu1").update({"name": "First Anuvakam"})
    triggers.on_node_written(deps, "rudram", "anu1", {"name": "Anuvakam 1", "parentId": "namakam"}, {"name": "First Anuvakam", "parentId": "namakam"})
    assert (root / "LearnChants/Sri Rudram/Namakam/First Anuvakam/Verse 1/audio/audio.webm").is_file()


def test_material_upload(deps):
    seed_playlist(deps)
    deps.db.document("playlists/rudram/materials/mat1").set({"title": "Rudram text", "type": "pdf", "nodeId": None, "status": "uploading"})
    upload(deps, SUPER, {"purpose": "material", "playlistId": "rudram", "materialId": "mat1", "mimeType": "application/pdf", "fileName": "rudram.pdf"})
    assert (deps.config.mock_drive_root / "LearnChants/Sri Rudram/materials/rudram.pdf").is_file()
    assert deps.db.data("playlists/rudram/materials/mat1")["status"] == "ready"


def test_drive_auth_url_mock_and_real(deps):
    assert storage.drive_auth_url(deps, SUPER)["mock"] is True
    from dataclasses import replace

    deps.config = replace(deps.config, mock_drive=False)
    res = storage.drive_auth_url(deps, SUPER)
    assert "accounts.google.com" in res["url"] and "drive.file" in res["url"] and "access_type=offline" in res["url"]
    with pytest.raises(HttpsError):
        storage.drive_auth_url(deps, LEARNER)


def test_oauth_callback_stores_encrypted_token(deps):
    from dataclasses import replace
    from urllib.parse import parse_qs, urlparse

    deps.config = replace(deps.config, mock_drive=False)
    url = storage.drive_auth_url(deps, SUPER)["url"]
    state = parse_qs(urlparse(url).query)["state"][0]
    target = storage.drive_oauth_callback(deps, "code123", state, exchange=lambda _d, _c: {"refresh_token": "rt-secret", "scope": "drive.file"})
    assert target.endswith("/admin/settings?drive=connected")
    conn = deps.db.data(f"driveConnections/{SUPER.uid}")
    assert conn["status"] == "connected" and "rt-secret" not in str(conn)
    assert deps.db.data(f"adminSettings/{SUPER.uid}")["driveStatus"] == "connected"
    assert storage.drive_oauth_callback(deps, "code", "forged.state", exchange=lambda *_: {}).endswith("drive=error")
