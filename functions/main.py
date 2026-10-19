"""Cloud Functions entry point (2nd gen, Python 3.12).

Each function is a thin adapter: build the caller from ``request.auth``, call
the business logic in ``lc``, and let ``HttpsError`` propagate as a typed error.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

from firebase_functions import firestore_fn, https_fn, options, params

from lc import admins, media, payments, profile, review, storage, triggers, uploads
from lc.config import Config
from lc.firebase_app import init_app
from lc.core import Deps, caller_from_auth

options.set_global_options(region="us-central1", max_instances=10)

# The callable SDK verifies ID tokens with the default app, so initialise at import.
init_app()

GOOGLE_CLIENT_ID = params.SecretParam("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = params.SecretParam("GOOGLE_CLIENT_SECRET")
TOKEN_ENCRYPTION_KEY = params.SecretParam("TOKEN_ENCRYPTION_KEY")
MEDIA_TOKEN_SECRET = params.SecretParam("MEDIA_TOKEN_SECRET")
# Non-secret params come from functions/.env.<project> (see README).
APP_URL = params.StringParam("APP_URL", default="http://localhost:5173")
MOCK_DRIVE = params.BoolParam("MOCK_DRIVE", default=False)

DRIVE_SECRETS = [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_ENCRYPTION_KEY]
ALL_SECRETS = DRIVE_SECRETS + [MEDIA_TOKEN_SECRET]

ENFORCE_APP_CHECK = os.environ.get("ENFORCE_APP_CHECK", "false").lower() == "true"


@lru_cache(maxsize=1)
def deps() -> Deps:
    from firebase_admin import auth, firestore

    return Deps(
        db=firestore.client(),
        auth=auth,
        config=Config.from_env(),
        storage_factory=storage.default_storage_factory,
    )


def _call(fn, req: https_fn.CallableRequest, **kw: Any) -> Any:
    return fn(deps(), caller_from_auth(req.auth), req.data, **kw)


def _origin(req: https_fn.CallableRequest) -> str | None:
    raw = getattr(req, "raw_request", None)
    return raw.headers.get("Origin") if raw is not None else None


# --- profile & admins -------------------------------------------------------
@https_fn.on_call(enforce_app_check=ENFORCE_APP_CHECK)
def init_profile(req: https_fn.CallableRequest) -> Any:
    return _call(profile.init_profile, req)


@https_fn.on_call(enforce_app_check=ENFORCE_APP_CHECK)
def create_admin_invite(req: https_fn.CallableRequest) -> Any:
    return _call(admins.create_admin_invite, req)


@https_fn.on_call(enforce_app_check=ENFORCE_APP_CHECK)
def accept_admin_invite(req: https_fn.CallableRequest) -> Any:
    return _call(admins.accept_admin_invite, req)


@https_fn.on_call(enforce_app_check=ENFORCE_APP_CHECK)
def deactivate_admin(req: https_fn.CallableRequest) -> Any:
    return _call(admins.deactivate_admin, req)


@https_fn.on_call(enforce_app_check=ENFORCE_APP_CHECK)
def remove_admin(req: https_fn.CallableRequest) -> Any:
    return _call(admins.remove_admin, req)


# --- Drive connection & storage location --------------------------------------
@https_fn.on_call(enforce_app_check=ENFORCE_APP_CHECK, secrets=ALL_SECRETS)
def drive_auth_url(req: https_fn.CallableRequest) -> Any:
    return _call(storage.drive_auth_url, req)


@https_fn.on_request(secrets=ALL_SECRETS)
def drive_oauth_callback(req: https_fn.Request) -> https_fn.Response:
    target = storage.drive_oauth_callback(
        deps(), req.args.get("code"), req.args.get("state"), req.args.get("error")
    )
    return https_fn.Response(status=302, headers={"Location": target, "Cache-Control": "no-store"})


@https_fn.on_call(enforce_app_check=ENFORCE_APP_CHECK, secrets=ALL_SECRETS)
def drive_status(req: https_fn.CallableRequest) -> Any:
    return _call(storage.drive_status, req)


@https_fn.on_call(enforce_app_check=ENFORCE_APP_CHECK, secrets=ALL_SECRETS)
def drive_disconnect(req: https_fn.CallableRequest) -> Any:
    return _call(storage.drive_disconnect, req)


@https_fn.on_call(enforce_app_check=ENFORCE_APP_CHECK, secrets=ALL_SECRETS)
def set_storage_location(req: https_fn.CallableRequest) -> Any:
    return _call(storage.set_storage_location, req)


@https_fn.on_call(enforce_app_check=ENFORCE_APP_CHECK, secrets=ALL_SECRETS, timeout_sec=300)
def move_storage(req: https_fn.CallableRequest) -> Any:
    return _call(storage.move_storage, req)


# --- uploads & media ------------------------------------------------------------
@https_fn.on_call(enforce_app_check=ENFORCE_APP_CHECK, secrets=ALL_SECRETS)
def create_upload_session(req: https_fn.CallableRequest) -> Any:
    return _call(uploads.create_upload_session, req, origin=_origin(req))


@https_fn.on_call(enforce_app_check=ENFORCE_APP_CHECK, secrets=ALL_SECRETS)
def finalize_upload(req: https_fn.CallableRequest) -> Any:
    return _call(uploads.finalize_upload, req)


@https_fn.on_call(enforce_app_check=ENFORCE_APP_CHECK, secrets=[MEDIA_TOKEN_SECRET])
def get_media_url(req: https_fn.CallableRequest) -> Any:
    return _call(media.get_media_url, req)


@https_fn.on_request(secrets=ALL_SECRETS, timeout_sec=540, memory=options.MemoryOption.MB_512)
def stream_media(req: https_fn.Request) -> https_fn.Response:
    if req.method not in ("GET", "HEAD"):
        return https_fn.Response("Method not allowed", status=405)
    token = req.path.rstrip("/").rsplit("/", 1)[-1]
    status, headers, body = media.stream_media(deps(), token, req.headers.get("Range"))
    if req.method == "HEAD":
        body = b""
    return https_fn.Response(body, status=status, headers=headers, direct_passthrough=True)


_UPLOAD_CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Content-Range",
    "Access-Control-Expose-Headers": "Range",
}


@https_fn.on_request()
def mock_upload(req: https_fn.Request) -> https_fn.Response:
    """Local stand-in for Drive's resumable upload endpoint (MOCK_DRIVE only)."""
    if req.method == "OPTIONS":
        return https_fn.Response(status=204, headers=_UPLOAD_CORS)
    if req.method != "PUT":
        return https_fn.Response("Method not allowed", status=405, headers=_UPLOAD_CORS)
    session_id = req.path.rstrip("/").rsplit("/", 1)[-1]
    status, headers, body = uploads.mock_upload(
        deps(), session_id, req.headers.get("Content-Range"), req.get_data()
    )
    return https_fn.Response(body, status=status, headers={**headers, **_UPLOAD_CORS})


# --- payments -----------------------------------------------------------------
@https_fn.on_call(enforce_app_check=ENFORCE_APP_CHECK)
def submit_payment_request(req: https_fn.CallableRequest) -> Any:
    return _call(payments.submit_payment_request, req)


@https_fn.on_call(enforce_app_check=ENFORCE_APP_CHECK)
def review_payment(req: https_fn.CallableRequest) -> Any:
    return _call(payments.review_payment, req)


@https_fn.on_call(enforce_app_check=ENFORCE_APP_CHECK)
def revoke_access(req: https_fn.CallableRequest) -> Any:
    return _call(payments.revoke_access, req)


# --- review -------------------------------------------------------------------
@https_fn.on_call(enforce_app_check=ENFORCE_APP_CHECK)
def review_submission(req: https_fn.CallableRequest) -> Any:
    return _call(review.review_submission, req)


# --- triggers -----------------------------------------------------------------
def _dict(snap: Any) -> dict | None:
    return snap.to_dict() if snap is not None and snap.exists else None


@firestore_fn.on_document_written(document="playlists/{pid}/verses/{vid}", secrets=ALL_SECRETS)
def on_verse_written(event: firestore_fn.Event[firestore_fn.Change[firestore_fn.DocumentSnapshot]]) -> None:
    triggers.on_verse_written(
        deps(), event.params["pid"], event.params["vid"], _dict(event.data.before), _dict(event.data.after)
    )


@firestore_fn.on_document_written(document="playlists/{pid}/nodes/{nid}", secrets=ALL_SECRETS)
def on_node_written(event: firestore_fn.Event[firestore_fn.Change[firestore_fn.DocumentSnapshot]]) -> None:
    triggers.on_node_written(
        deps(), event.params["pid"], event.params["nid"], _dict(event.data.before), _dict(event.data.after)
    )


@firestore_fn.on_document_written(document="playlists/{pid}", secrets=ALL_SECRETS)
def on_playlist_written(event: firestore_fn.Event[firestore_fn.Change[firestore_fn.DocumentSnapshot]]) -> None:
    triggers.on_playlist_written(deps(), event.params["pid"], _dict(event.data.before), _dict(event.data.after))
