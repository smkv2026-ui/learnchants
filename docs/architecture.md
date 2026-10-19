# Architecture

```
Browser (React PWA, Workbox SW, Firestore offline cache)
  │  Firebase Auth (ID token + role claim)     App Check (reCAPTCHA v3)
  ├──► Firestore  (direct reads/writes, guarded by firestore.rules)
  ├──► Storage    (public cover images only)
  ├──► Callable functions (Python) ── init_profile, admin invites, uploads, media URLs, payments, review
  ├──► /media/<token>      ─ Hosting rewrite ─► stream_media (Range proxy from Drive)
  ├──► /drive/callback     ─ Hosting rewrite ─► drive_oauth_callback
  └──► PUT bytes ────────────────────────────► Google Drive resumable session URI
                                               (/mock-upload/<id> → mock_upload when MOCK_DRIVE=true)
Firestore triggers: on_verse_written / on_node_written / on_playlist_written
  → verseCount + progress totals, Drive folder rename sync, Drive cleanup
```

## Functions code layout
- `functions/main.py`: thin Firebase adapters (decorators, secrets, App Check flag).
- `functions/lc/`: business logic taking a `Deps` bundle (Firestore client, auth adapter, storage factory, config, clock), so tests run against in-memory fakes (`functions/tests/fakes.py`).
  - `admins.py`, `profile.py`: roles via custom claims, invites, deactivate/remove.
  - `storage.py`: Drive OAuth, storage location resolution, mirrored folder paths + cache, move/rename.
  - `uploads.py`: resumable upload sessions, finalize, mock resumable endpoint.
  - `media.py`: access checks, HMAC media tokens, Range streaming.
  - `payments.py`, `review.py`, `triggers.py`.
- `functions/drive/`: `StorageProvider` interface, `GoogleDriveProvider` (Drive v3 REST via `AuthorizedSession`, exponential backoff on quota/5xx, reconnect state on auth failure), `LocalMockProvider` (real folders on disk with an id index).

## Data model (Firestore)
See `CLAUDE.md`. Additions: `adminUsers/{uid}` (admin directory; rules require an active record for admin access), `driveFolders/{owner}__{hash}` (functions-only folder-id cache keyed by entity ids), `users/{uid}/meta/stats` (activity days for streaks), and `users/{uid}/progress/{pid}.nodeApproved` (approved counts per node, rolled up to every ancestor on approval).

## Security model
1. **Rules first**: learner-readable docs contain no identity fields (writes containing `ownerUid`, `createdBy`, `driveFileId`, … are rejected); admin-only and functions-only collections are closed to learners; trusted state (grants, payments, submissions, replies, progress, notifications creation) is written only by functions.
2. **Functions re-check** `request.auth` and the role claim on every call; media access is checked on each URL issuance; tokens expire after 15 minutes.
3. **Secrets** (OAuth client secret, AES key for refresh tokens, HMAC key) are in Secret Manager; refresh tokens are encrypted at rest and never leave functions.
4. **Anonymity** is verified by `functions/tests/test_security.py` (scans every learner-readable document and learner-facing response for admin uids/emails/names and Drive ids) and `apps/web/tests/rules`.
