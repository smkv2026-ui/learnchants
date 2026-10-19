"""Phase 7: authorisation for every callable and admin anonymity guarantees."""

import json

import pytest
from firebase_functions.https_fn import HttpsError

from lc import admins, media, payments, profile, review, storage, uploads

from .conftest import ADMIN, LEARNER, SUPER, seed_playlist, upload
from .test_admins import code

ALL_CALLABLES = [
    profile.init_profile,
    admins.create_admin_invite,
    admins.accept_admin_invite,
    admins.deactivate_admin,
    admins.remove_admin,
    storage.drive_auth_url,
    storage.drive_status,
    storage.drive_disconnect,
    storage.set_storage_location,
    storage.move_storage,
    uploads.create_upload_session,
    uploads.finalize_upload,
    media.get_media_url,
    payments.submit_payment_request,
    payments.review_payment,
    payments.revoke_access,
    review.review_submission,
]

ADMIN_ONLY = [
    (admins.create_admin_invite, {}),
    (admins.deactivate_admin, {"uid": "admin2"}),
    (admins.remove_admin, {"uid": "admin2"}),
    (storage.drive_auth_url, {}),
    (storage.drive_status, {}),
    (storage.drive_disconnect, {}),
    (storage.set_storage_location, {"scope": "default", "folderName": "x"}),
    (storage.move_storage, {"playlistId": "rudram"}),
    (payments.review_payment, {"requestId": "r1", "decision": "APPROVED"}),
    (payments.revoke_access, {"uid": "learner1", "playlistId": "rudram"}),
    (review.review_submission, {"submissionId": "s1", "status": "APPROVED"}),
    (uploads.create_upload_session, {"purpose": "verse_audio", "playlistId": "rudram", "verseId": "v1", "mimeType": "audio/webm", "size": 10}),
    (uploads.create_upload_session, {"purpose": "material", "playlistId": "rudram", "materialId": "m", "mimeType": "application/pdf", "size": 10}),
    (uploads.create_upload_session, {"purpose": "reply", "playlistId": "rudram", "submissionId": "s", "mimeType": "audio/webm", "size": 10}),
]


@pytest.mark.parametrize("fn", ALL_CALLABLES, ids=lambda f: f.__name__)
def test_every_callable_requires_sign_in(deps, fn):
    seed_playlist(deps)
    with pytest.raises(HttpsError) as e:
        fn(deps, None, {})
    assert code(e) == "unauthenticated"


@pytest.mark.parametrize("fn,data", ADMIN_ONLY, ids=lambda x: getattr(x, "__name__", ""))
def test_admin_only_callables_reject_learners(deps, fn, data):
    seed_playlist(deps)
    with pytest.raises(HttpsError) as e:
        fn(deps, LEARNER, data)
    assert code(e) == "permission-denied"


def test_only_super_admin_removes_admins(deps):
    with pytest.raises(HttpsError) as e:
        admins.remove_admin(deps, ADMIN, {"uid": SUPER.uid})
    assert code(e) == "permission-denied"


# Paths a learner can read according to firestore.rules.
LEARNER_READABLE = (
    "playlists/",
    "submissions/",
    "accessGrants/",
    "paymentRequests/",
    "users/",
)


def _learner_visible_docs(deps):
    return {p: d for p, d in deps.db.docs.items() if p.startswith(LEARNER_READABLE)}


def test_no_admin_identity_or_drive_ids_in_learner_readable_data(deps):
    seed_playlist(deps, access="paid", price=99)
    deps.db.document("playlists/rudram/payment/info").set({"upiId": "trust@upi", "payeeName": "Learn Chants Trust"})
    responses = []
    # admin authoring
    responses.append(upload(deps, SUPER, {"purpose": "verse_audio", "playlistId": "rudram", "verseId": "v1", "mimeType": "audio/webm"}))
    upload(deps, ADMIN, {"purpose": "verse_video", "playlistId": "rudram", "verseId": "v1", "mimeType": "video/mp4"})
    deps.db.document("playlists/rudram/materials/mat").set({"title": "Text", "type": "pdf"})
    upload(deps, SUPER, {"purpose": "material", "playlistId": "rudram", "materialId": "mat", "mimeType": "application/pdf"})
    # learner pays, admin approves
    shot = upload(deps, LEARNER, {"purpose": "payment_screenshot", "playlistId": "rudram", "mimeType": "image/png"})
    responses.append(shot)
    pr = payments.submit_payment_request(deps, LEARNER, {"playlistId": "rudram", "reference": "UTR123456", "screenshotMediaId": shot["mediaId"]})
    responses.append(pr)
    payments.review_payment(deps, ADMIN, {"requestId": pr["requestId"], "decision": "APPROVED"})
    # learner practises, admin replies with audio and approves
    sub = upload(deps, LEARNER, {"purpose": "submission", "playlistId": "rudram", "verseId": "v1", "mimeType": "audio/webm"})
    responses.append(sub)
    reply = upload(deps, ADMIN, {"purpose": "reply", "playlistId": "rudram", "submissionId": sub["submissionId"], "mimeType": "audio/webm"})
    review.review_submission(deps, ADMIN, {"submissionId": sub["submissionId"], "status": "APPROVED", "text": "Well done", "replyMediaId": reply["mediaId"]})
    for mid in (responses[0]["mediaId"], sub["mediaId"], reply["mediaId"]):
        responses.append(media.get_media_url(deps, LEARNER, {"mediaId": mid}))

    drive_ids = {d["driveFileId"] for p, d in deps.db.docs.items() if p.startswith("driveFiles/") and d.get("driveFileId")}
    drive_ids |= {d["folderId"] for p, d in deps.db.docs.items() if p.startswith(("driveFolders/", "driveFiles/"))}
    secrets = {SUPER.uid, ADMIN.uid, SUPER.email, ADMIN.email, SUPER.name, ADMIN.name} | drive_ids
    assert drive_ids, "expected stored Drive ids to check against"

    blob = json.dumps(_learner_visible_docs(deps), default=str) + json.dumps(responses, default=str)
    leaks = sorted(s for s in secrets if s and s in blob)
    assert leaks == [], f"learner-visible data leaks admin identity / Drive ids: {leaks}"

    replies = [d for p, d in deps.db.docs.items() if "/replies/" in p]
    assert replies and all(r["authorLabel"] == "Your Teacher" for r in replies)
    notes = [d["message"] for p, d in deps.db.docs.items() if "/notifications/" in p]
    assert any("Your Teacher" in m for m in notes)
    # admin identity is still recorded for admins (audit trail)
    assert any(d["actorUid"] == ADMIN.uid for p, d in deps.db.docs.items() if p.startswith("auditLogs/"))
