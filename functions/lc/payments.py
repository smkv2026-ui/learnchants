"""Manual UPI payments: learner submits a reference, an admin approves/rejects."""

from __future__ import annotations

import re
from typing import Any

from google.cloud.firestore_v1.base_query import FieldFilter

from .access import get_playlist, grant_id, has_grant
from .core import Caller, Code, Deps, audit, fail, notify, parse, require_admin, require_auth, fget
from .models import PaymentReq, ReviewPaymentReq, RevokeAccessReq

_REF_RE = re.compile(r"^[A-Z0-9-]{6,40}$")


def normalise_reference(raw: str) -> str:
    ref = re.sub(r"\s+", "", raw or "").upper()
    if not _REF_RE.match(ref):
        raise fail(Code.INVALID_ARGUMENT, "Enter the UPI reference / UTR number (6-40 letters or digits).")
    return ref


def submit_payment_request(deps: Deps, caller: Caller | None, data: Any) -> dict:
    caller = require_auth(caller)
    req = parse(PaymentReq, data)
    ref = normalise_reference(req.reference)
    playlist = get_playlist(deps, req.playlistId)
    if not playlist.get("published") or playlist.get("access") != "paid":
        raise fail(Code.FAILED_PRECONDITION, "This playlist does not require payment.")
    if has_grant(deps, caller.uid, req.playlistId):
        raise fail(Code.ALREADY_EXISTS, "You already have access to this playlist.")

    requests = deps.db.collection("paymentRequests")
    mine = requests.where(filter=FieldFilter("uid", "==", caller.uid)).where(
        filter=FieldFilter("pid", "==", req.playlistId)
    )
    if any(fget(s, "status") == "PENDING" for s in mine.stream()):
        raise fail(Code.ALREADY_EXISTS, "You already have a payment request awaiting review.")

    duplicate_flag = False
    for other in requests.where(filter=FieldFilter("reference", "==", ref)).stream():
        if fget(other, "status") in {"PENDING", "APPROVED"}:
            raise fail(
                Code.ALREADY_EXISTS,
                "This payment reference has already been submitted.",
                {"duplicate": True},
            )
        duplicate_flag = True  # re-used after a rejection: allow, but flag for the admin

    if req.screenshotMediaId:
        shot = deps.db.collection("driveFiles").document(req.screenshotMediaId).get()
        if (
            not shot.exists
            or fget(shot, "purpose") != "payment_screenshot"
            or fget(shot, "uploaderUid") != caller.uid
            or fget(shot, "pid") != req.playlistId
            or fget(shot, "status") != "ready"
        ):
            raise fail(Code.INVALID_ARGUMENT, "Invalid screenshot.")

    user = deps.db.collection("users").document(caller.uid).get()
    _, doc = requests.add(
        {
            "uid": caller.uid,
            "userName": fget(user, "displayName") if user.exists else None,
            "pid": req.playlistId,
            "playlistTitle": playlist.get("title"),
            "amount": playlist.get("price"),
            "reference": ref,
            "screenshotMediaId": req.screenshotMediaId,
            "status": "PENDING",
            "reason": None,
            "duplicateFlag": duplicate_flag,
            "createdAt": deps.now(),
            "updatedAt": deps.now(),
        }
    )
    return {"requestId": doc.id, "status": "PENDING", "duplicateFlag": duplicate_flag}


def review_payment(deps: Deps, caller: Caller | None, data: Any) -> dict:
    caller = require_admin(caller)
    req = parse(ReviewPaymentReq, data)
    ref = deps.db.collection("paymentRequests").document(req.requestId)
    snap = ref.get()
    if not snap.exists:
        raise fail(Code.NOT_FOUND, "Payment request not found.")
    pr = snap.to_dict()
    if pr["status"] != "PENDING":
        raise fail(Code.FAILED_PRECONDITION, f"Request is already {pr['status'].lower()}.")
    if req.decision == "REJECTED" and not (req.reason or "").strip():
        raise fail(Code.INVALID_ARGUMENT, "A reason is required when rejecting.")

    now = deps.now()
    if req.decision == "APPROVED":
        deps.db.collection("accessGrants").document(grant_id(pr["uid"], pr["pid"])).set(
            {"uid": pr["uid"], "pid": pr["pid"], "grantedAt": now, "source": "payment", "requestId": req.requestId}
        )
        notify(deps, pr["uid"], "payment_approved", f"Your payment for “{pr.get('playlistTitle')}” was approved. Enjoy learning!", f"/p/{pr['pid']}")
    else:
        notify(
            deps,
            pr["uid"],
            "payment_rejected",
            f"Your payment for “{pr.get('playlistTitle')}” could not be verified: {req.reason}. You can submit again.",
            f"/p/{pr['pid']}/pay",
        )
    ref.update({"status": req.decision, "reason": req.reason if req.decision == "REJECTED" else None, "reviewedAt": now, "updatedAt": now})
    audit(deps, caller, f"payment.{req.decision.lower()}", {"requestId": req.requestId, "uid": pr["uid"], "pid": pr["pid"]})
    return {"status": req.decision}


def revoke_access(deps: Deps, caller: Caller | None, data: Any) -> dict:
    caller = require_admin(caller)
    req = parse(RevokeAccessReq, data)
    ref = deps.db.collection("accessGrants").document(grant_id(req.uid, req.playlistId))
    if not ref.get().exists:
        raise fail(Code.NOT_FOUND, "No access grant to revoke.")
    ref.delete()
    playlist = get_playlist(deps, req.playlistId)
    notify(deps, req.uid, "access_revoked", f"Your access to “{playlist.get('title')}” has been revoked." + (f" {req.reason}" if req.reason else ""), f"/p/{req.playlistId}")
    audit(deps, caller, "access.revoke", {"uid": req.uid, "pid": req.playlistId}, reason=req.reason)
    return {"revoked": True}
