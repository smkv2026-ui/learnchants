import time

import pytest
from firebase_functions.https_fn import HttpsError

from lc import crypto, media, payments, review

from .conftest import ADMIN, LEARNER, LEARNER2, SUPER, seed_playlist, upload
from .test_admins import code


def _audio(deps, vid="v1"):
    return upload(deps, SUPER, {"purpose": "verse_audio", "playlistId": "rudram", "verseId": vid, "mimeType": "audio/webm"}, content=bytes(range(256)) * 4)


def test_media_url_and_range_stream(deps):
    seed_playlist(deps)
    m = _audio(deps)
    res = media.get_media_url(deps, LEARNER, {"mediaId": m["mediaId"]})
    assert res["url"].startswith("/media/")
    assert "driveFileId" not in str(res) and "mf" not in res["url"].split("/")[-1][:3]
    token = res["url"].rsplit("/", 1)[-1]
    status, headers, body = media.stream_media(deps, token, "bytes=10-19")
    assert status == 206 and headers["Content-Range"] == "bytes 10-19/1024"
    assert b"".join(body) == bytes(range(10, 20))
    status, headers, body = media.stream_media(deps, token, None)
    assert status == 200 and headers["Content-Length"] == "1024"
    assert media.stream_media(deps, token, "bytes=5000-")[0] == 416
    assert media.stream_media(deps, token + "x", None)[0] == 403


def test_media_token_expires(deps):
    seed_playlist(deps)
    m = _audio(deps)
    expired = crypto.sign({"m": m["mediaId"], "u": "x", "exp": time.time() - 5}, deps.config.media_token_secret)
    assert media.stream_media(deps, expired, None)[0] == 403


def test_parse_range():
    assert media.parse_range("bytes=0-", 100) == (0, 99)
    assert media.parse_range("bytes=-10", 100) == (90, 99)
    assert media.parse_range("bytes=50-500", 100) == (50, 99)
    assert media.parse_range(None, 100) is None
    with pytest.raises(ValueError):
        media.parse_range("bytes=100-", 100)


def test_paid_media_locked_until_payment_approved(deps):
    seed_playlist(deps, access="paid", price=501)
    m = _audio(deps)
    with pytest.raises(HttpsError) as e:
        media.get_media_url(deps, LEARNER, {"mediaId": m["mediaId"]})
    assert code(e) == "permission-denied" and e.value.details == {"locked": True}
    # admins are exempt
    assert media.get_media_url(deps, ADMIN, {"mediaId": m["mediaId"]})["url"]

    shot = upload(deps, LEARNER, {"purpose": "payment_screenshot", "playlistId": "rudram", "mimeType": "image/png", "fileName": "pay.png"})
    assert (deps.config.mock_drive_root / "LearnChants/Sri Rudram/_Payments/Asha_learner1").is_dir()
    req = payments.submit_payment_request(deps, LEARNER, {"playlistId": "rudram", "reference": " 4123 5678 9012 ", "screenshotMediaId": shot["mediaId"]})
    pr = deps.db.data(f"paymentRequests/{req['requestId']}")
    assert pr["reference"] == "412356789012" and pr["amount"] == 501 and pr["status"] == "PENDING"
    with pytest.raises(HttpsError) as e:
        payments.submit_payment_request(deps, LEARNER, {"playlistId": "rudram", "reference": "999999999"})
    assert code(e) == "already-exists"  # one pending at a time
    with pytest.raises(HttpsError) as e:
        payments.submit_payment_request(deps, LEARNER2, {"playlistId": "rudram", "reference": "412356789012"})
    assert code(e) == "already-exists" and e.value.details == {"duplicate": True}
    with pytest.raises(HttpsError):
        payments.review_payment(deps, LEARNER, {"requestId": req["requestId"], "decision": "APPROVED"})

    with pytest.raises(HttpsError):
        payments.review_payment(deps, ADMIN, {"requestId": req["requestId"], "decision": "REJECTED"})  # no reason
    payments.review_payment(deps, ADMIN, {"requestId": req["requestId"], "decision": "REJECTED", "reason": "UTR not found"})
    with pytest.raises(HttpsError):
        media.get_media_url(deps, LEARNER, {"mediaId": m["mediaId"]})

    # rejected learner can resubmit; reusing the rejected reference is allowed but flagged
    again = payments.submit_payment_request(deps, LEARNER, {"playlistId": "rudram", "reference": "412356789012"})
    assert again["duplicateFlag"] is True
    payments.review_payment(deps, SUPER, {"requestId": again["requestId"], "decision": "APPROVED"})
    assert deps.db.data("accessGrants/learner1_rudram")["pid"] == "rudram"
    assert media.get_media_url(deps, LEARNER, {"mediaId": m["mediaId"]})["url"]
    with pytest.raises(HttpsError) as e:
        payments.submit_payment_request(deps, LEARNER, {"playlistId": "rudram", "reference": "ABCDEF123"})
    assert code(e) == "already-exists"

    payments.revoke_access(deps, ADMIN, {"uid": LEARNER.uid, "playlistId": "rudram"})
    with pytest.raises(HttpsError):
        media.get_media_url(deps, LEARNER, {"mediaId": m["mediaId"]})
    notes = [d["type"] for p, d in deps.db.docs.items() if p.startswith("users/learner1/notifications/")]
    assert notes == ["payment_rejected", "payment_approved", "access_revoked"]


def test_free_playlist_payment_rejected(deps):
    seed_playlist(deps)
    with pytest.raises(HttpsError) as e:
        payments.submit_payment_request(deps, LEARNER, {"playlistId": "rudram", "reference": "123456789"})
    assert code(e) == "failed-precondition"


def test_unpublished_playlist_media_hidden(deps):
    seed_playlist(deps, published=False)
    m = _audio(deps)
    with pytest.raises(HttpsError):
        media.get_media_url(deps, LEARNER, {"mediaId": m["mediaId"]})


def test_submission_media_private_to_owner_and_admins(deps):
    seed_playlist(deps)
    sub = upload(deps, LEARNER, {"purpose": "submission", "playlistId": "rudram", "verseId": "v1", "mimeType": "audio/webm"})
    assert media.get_media_url(deps, LEARNER, {"mediaId": sub["mediaId"]})
    assert media.get_media_url(deps, ADMIN, {"mediaId": sub["mediaId"]})
    with pytest.raises(HttpsError):
        media.get_media_url(deps, LEARNER2, {"mediaId": sub["mediaId"]})


def test_review_updates_progress_at_every_level(deps):
    seed_playlist(deps)
    s1 = upload(deps, LEARNER, {"purpose": "submission", "playlistId": "rudram", "verseId": "v1", "mimeType": "audio/webm"})
    with pytest.raises(HttpsError):
        review.review_submission(deps, LEARNER, {"submissionId": s1["submissionId"], "status": "APPROVED"})
    with pytest.raises(HttpsError):
        review.review_submission(deps, ADMIN, {"submissionId": s1["submissionId"], "status": "NEEDS_WORK"})  # needs a correction

    reply = upload(deps, ADMIN, {"purpose": "reply", "playlistId": "rudram", "submissionId": s1["submissionId"], "mimeType": "audio/webm"})
    assert (deps.config.mock_drive_root / "LearnChants/Sri Rudram/_Learners/Asha_learner1/Verse 1/replies").is_dir()
    review.review_submission(deps, ADMIN, {"submissionId": s1["submissionId"], "status": "NEEDS_WORK", "text": "Stretch the 'ma'", "replyMediaId": reply["mediaId"]})
    assert deps.db.data("users/learner1/progress/rudram/verseStatus/v1")["status"] == "NEEDS_WORK"
    assert media.get_media_url(deps, LEARNER, {"mediaId": reply["mediaId"]})
    with pytest.raises(HttpsError):
        media.get_media_url(deps, LEARNER2, {"mediaId": reply["mediaId"]})

    res = review.review_submission(deps, ADMIN, {"submissionId": s1["submissionId"], "status": "APPROVED", "text": "Perfect"})
    prog = deps.db.data("users/learner1/progress/rudram")
    assert prog["approvedCount"] == 1 and prog["totalCount"] == 3
    assert prog["nodeApproved"] == {"namakam": 1, "anu1": 1}
    assert res["celebrate"] == []
    # approving again doesn't double count
    review.review_submission(deps, ADMIN, {"submissionId": s1["submissionId"], "status": "APPROVED"})
    assert deps.db.data("users/learner1/progress/rudram")["approvedCount"] == 1

    s2 = upload(deps, LEARNER, {"purpose": "submission", "playlistId": "rudram", "verseId": "v2", "mimeType": "audio/webm"})
    res = review.review_submission(deps, SUPER, {"submissionId": s2["submissionId"], "status": "APPROVED"})
    assert res["celebrate"] == ["section:anu1"]
    s3 = upload(deps, LEARNER, {"purpose": "submission", "playlistId": "rudram", "verseId": "v3", "mimeType": "audio/webm"})
    res = review.review_submission(deps, SUPER, {"submissionId": s3["submissionId"], "status": "APPROVED"})
    assert "playlist" in res["celebrate"] and "section:namakam" in res["celebrate"]

    # downgrade decrements
    review.review_submission(deps, SUPER, {"submissionId": s3["submissionId"], "status": "NEEDS_WORK", "text": "Redo"})
    prog = deps.db.data("users/learner1/progress/rudram")
    assert prog["approvedCount"] == 2 and prog["nodeApproved"]["namakam"] == 2 and prog["nodeApproved"]["anu2"] == 0

    replies = [d for p, d in deps.db.docs.items() if "/replies/" in p]
    assert replies and all(r["authorLabel"] == "Your Teacher" for r in replies)
    assert all(set(r) == {"text", "mediaId", "kind", "status", "authorLabel", "createdAt"} for r in replies)


def test_triggers_recount_and_recompute(deps):
    from lc import triggers

    seed_playlist(deps)
    assert deps.db.data("playlists/rudram")["verseCount"] == 3
    assert deps.db.data("playlists/rudram/nodes/namakam")["verseCount"] == 3
    assert deps.db.data("playlists/rudram/nodes/anu1")["verseCount"] == 2
    s1 = upload(deps, LEARNER, {"purpose": "submission", "playlistId": "rudram", "verseId": "v1", "mimeType": "audio/webm"})
    review.review_submission(deps, SUPER, {"submissionId": s1["submissionId"], "status": "APPROVED"})
    m = _audio(deps, "v1")
    before = deps.db.data("playlists/rudram/verses/v1")
    deps.db.document("playlists/rudram/verses/v1").delete()
    triggers.on_verse_written(deps, "rudram", "v1", before, None)
    assert deps.db.data("playlists/rudram")["verseCount"] == 2
    assert deps.db.data(f"driveFiles/{m['mediaId']}") is None
    prog = deps.db.data("users/learner1/progress/rudram")
    assert prog["approvedCount"] == 0 and prog["totalCount"] == 2
    assert not (deps.config.mock_drive_root / "LearnChants/Sri Rudram/Namakam/Anuvakam 1/Verse 1").exists()
    # new verse increments totals
    deps.db.document("playlists/rudram/verses/v9").set({"nodeId": "anu5", "name": "Verse 9", "order": 1})
    triggers.on_verse_written(deps, "rudram", "v9", None, {"nodeId": "anu5", "name": "Verse 9"})
    assert deps.db.data("users/learner1/progress/rudram")["totalCount"] == 3
    assert deps.db.data("playlists/rudram/nodes/anu5")["verseCount"] == 1
