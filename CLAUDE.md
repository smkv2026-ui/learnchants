# CLAUDE.md: Learn Chants

Guidance for Claude Code when working in this repository. Read `docs/BRD.md` for full requirements before making significant changes.

## Project Summary
Learn Chants is a responsive, installable PWA for learning Vedic/devotional chants verse by verse. Admins (teachers) author playlists with audio/video/meaning; media is stored in the admin's Google Drive in a folder tree mirroring the playlist hierarchy. Learners loop-listen (3x), record their own chanting (3x), send feedback, receive corrections, and see progress. Some playlists are paid via UPI with manual admin approval.

## Architecture: Firebase only (NO Node.js/Express server)
There is no self-hosted backend. Everything runs on Firebase, with Google Drive as the media store.

- **Hosting**: Firebase Hosting serves the PWA over HTTPS at a live URL (`<project>.web.app`, custom domain optional).
- **Auth**: Firebase Authentication (email/password + Google sign-in). Roles (`SUPER_ADMIN`, `ADMIN`, `USER`) are stored as **custom claims** (`role`) set only by Cloud Functions.
- **Database**: Cloud Firestore, protected by Security Rules (the primary authorisation layer for direct client reads/writes).
- **Server logic**: Cloud Functions for Firebase, 2nd gen, written in **Python 3.12** (`firebase-functions` Python SDK). Use functions only where secrets, Drive tokens, or trusted logic are needed (see list below).
- **Media storage**: Google Drive (Drive API v3 via `google-api-python-client`). Firebase Storage is used ONLY for small public cover images.
- **Secrets**: Google OAuth client secret, token-encryption key, and media-token signing key live in Secret Manager (`firebase functions:secrets:set`), never in the client or repo.
- **Protection**: Firebase App Check (reCAPTCHA Enterprise/v3) on Firestore and Functions.
- **Local dev**: Firebase Emulator Suite (Auth, Firestore, Functions, Hosting).
- **Plan note**: Cloud Functions need the Firebase **Blaze** (pay-as-you-go) plan; usage for a small app is typically very low. Document this in the README.

## Frontend Stack
React 18 + TypeScript + Vite (build tooling only), `vite-plugin-pwa` (Workbox), React Router, TanStack Query, Zustand, Tailwind CSS, Framer Motion, `react-hook-form` + `zod`, `wavesurfer.js`, `canvas-confetti`, `dnd-kit`, `qrcode.react`, Firebase JS SDK v10 (modular imports). Enable Firestore offline persistence.

## Repository Layout
```
/apps/web            React PWA (Vite)
/functions           Python Cloud Functions (pydantic models, pytest tests)
/firestore.rules     Firestore Security Rules
/firestore.indexes.json
/storage.rules       Firebase Storage rules (cover images only)
/firebase.json       Hosting, Functions, Emulators config
/scripts             one-off Python scripts (bootstrap super admin, seed demo data)
/docs                BRD.md, CLAUDE_CODE_PROMPT.md, architecture notes
```

## Commands
- `pnpm install` (inside `apps/web`), `python -m venv functions/venv && pip install -r functions/requirements.txt`
- `firebase emulators:start`: run Auth, Firestore, Functions, Hosting locally
- `pnpm --filter web dev`: Vite dev server against emulators
- `pnpm --filter web build` then `firebase deploy`: ship to the live URL
- `pytest functions`: function tests; `pnpm --filter web test`: web unit tests
- `pnpm --filter web test:rules`: Firestore rules tests (`@firebase/rules-unit-testing`, dev tooling)
- `python scripts/bootstrap_super_admin.py`: creates the first Super Admin (reads email from env)
- `python scripts/seed_demo.py`: seeds a demo Sri Rudram > Namakam (11 anuvakams) with sample verses

## Environment and Secrets
- Web `.env` (public Firebase config only): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_APPCHECK_SITE_KEY`, `VITE_USE_EMULATORS`.
- Functions secrets (Secret Manager): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` (AES-256-GCM for Drive refresh tokens), `MEDIA_TOKEN_SECRET` (HMAC for short-lived media URLs).
- Functions params: `APP_URL`, `MOCK_DRIVE` (true uses local-disk/emulator storage, no Google credentials needed).
- Provide `.env.example` and document everything in `README.md`. Never commit secrets.

## Firestore Data Model
Public/learner-readable documents must never contain admin identity or Drive IDs.

- `users/{uid}`: displayName, email, createdAt. (Role is in the custom claim, not trusted from this doc.)
- `playlists/{pid}`: title, description, coverUrl, access (`free|paid`), price, published, order, verseCount.
- `playlists/{pid}/payment/info`: upiId, payeeName (readable by signed-in users; see anonymity note below).
- `playlists/{pid}/nodes/{nid}`: parentId, name, description, order.
- `playlists/{pid}/verses/{vid}`: nodeId, name, details, order, hasAudio, hasVideo.
- `playlists/{pid}/verses/{vid}/media/{mid}`: kind (`audio|video`), mimeType, durationSec. No Drive IDs.
- `playlists/{pid}/materials/{mid}`: title, type (`pdf|scripture|text`), text?, mediaId?.
- `adminPlaylists/{pid}`: ownerUid, storageFolderId override, createdBy (ADMIN-ONLY, rules deny learners).
- `driveFiles/{mediaId}`: driveFileId, folderId, ownerUid (FUNCTIONS-ONLY, rules deny all clients).
- `driveConnections/{adminUid}`: encrypted tokens, rootFolderId, status (FUNCTIONS-ONLY).
- `adminSettings/{adminUid}`: defaultFolderId, displayName (admin reads own only).
- `accessGrants/{uid_pid}`: uid, pid, grantedAt (functions write; user reads own).
- `paymentRequests/{id}`: uid, pid, amount, reference, screenshotMediaId?, status (`PENDING|APPROVED|REJECTED`), reason. The reviewing admin is recorded only in `auditLogs`.
- `submissions/{id}`: uid, pid, vid, kind, mediaId, status (`SUBMITTED|NEEDS_WORK|APPROVED`), createdAt.
- `submissions/{id}/replies/{rid}`: text?, mediaId?, createdAt (no author field; author goes to `auditLogs`).
- `users/{uid}/progress/{pid}`: approvedCount, totalCount; `users/{uid}/progress/{pid}/verses/{vid}`: status. (Functions write only.)
- `users/{uid}/notifications/{nid}`: type, message, read, createdAt.
- `adminInvites/{token}`, `auditLogs/{id}`: FUNCTIONS-ONLY writes; admin read for audit logs.

## Cloud Functions (Python) to implement
- Drive: `drive_auth_url`, `drive_oauth_callback` (HTTPS), `set_storage_location`, `ensure_folder_path` (idempotent, caches folder IDs).
- Uploads: `create_upload_session` (callable; verifies role/access, resolves the target Drive folder, creates a Drive **resumable upload session** with the admin's token and returns only the session URI, so the browser uploads directly to Drive without passing file bytes through functions), `finalize_upload` (records metadata in Firestore + `driveFiles`).
- Media: `get_media_url` (callable; checks access and returns a short-lived HMAC-signed URL), `stream_media` (HTTPS; validates the signed URL, streams from Drive with HTTP Range support).
- Admins: `create_admin_invite`, `accept_admin_invite`, `deactivate_admin`, `remove_admin` (SUPER_ADMIN only); all set/clear custom claims.
- Payments: `submit_payment_request` (duplicate reference check), `review_payment` (approve creates `accessGrants`, reject needs reason), `revoke_access`.
- Review: `review_submission` (reply + status; on APPROVED updates progress rollups, creates notification, writes audit log).
- Triggers: maintain `verseCount` and progress totals when verses/nodes change; clean up Drive files when content is deleted.

## Critical Rules (non-negotiable)

### 1. Admin anonymity
- Admin identity (uid, name, email) is stored only in admin-only collections (`adminPlaylists`, `auditLogs`). Learner-readable documents never contain it.
- Firestore rules must deny learners any read of admin-only collections. Replies are labelled "Your Teacher".
- Add rules tests proving a learner token cannot read any admin identifier or Drive ID.
- Caveat: a UPI ID/payee name is inherently visible to payers. Recommend admins use a neutral organisation/trust UPI ID and mention this in the admin UI near the UPI field.

### 2. Admin portal is hidden and server-enforced
- Admin UI lives under `/admin/*`, lazy-loaded in a separate chunk, no links from user screens.
- Authorisation is enforced by Firestore Security Rules and by the `role` claim checks inside every function, never by client-side hiding.
- Only admins can invite admins (single-use, expiring token). Only SUPER_ADMIN can remove admins. Users cannot self-assign roles (claims are set only by functions).

### 3. Drive storage
- Folder tree mirrors the classification: `<Root>/<Playlist>/<Node>/.../<Verse N>/{audio,video}.*`. Learner submissions go to `<Playlist>/_Learners/<Name>_<uid>/<Verse>/<timestamp>.*` inside the Drive of the admin who owns that playlist.
- Resolve target folder: playlist override > admin's global location. Create missing folders idempotently.
- OAuth scope `drive.file`; use Google Picker for folder selection. Refresh tokens are encrypted and used only inside functions. Never expose Drive links or tokens to the client.
- Changing location affects new uploads only; offer an explicit "move existing files" action.
- Uploads are resumable with progress and retry. Handle token expiry/quota with exponential backoff and a "reconnect Drive" state.
- Learners stream via signed `stream_media` URLs; verify access on every URL issuance.

### 4. Monetisation
- Free vs Paid per playlist: UPI ID, payee name, amount (INR). No payment gateway.
- Learner pays externally, submits reference number (+ optional screenshot stored in Drive). Admin approves/rejects. Approval creates the access grant. Duplicate references are flagged.
- `get_media_url` returns 403 for paid playlists without a grant (admins exempt). Metadata (description, materials list, badge) stays visible.
- UPI deep link: `upi://pay?pa=<id>&pn=<name>&am=<amount>&cu=INR&tn=<note>` plus QR.

### 5. Learning flow
- On verse open: loop audio (and video if present) exactly **3 times** with counter 1/3 to 3/3, pause/restart, speed control. Same behaviour in admin preview.
- Then guided 3-round learner recording, preview, re-record, submit.
- Progress = approved verses / total verses, rolled up per node and playlist. Only admin approval counts.

### 6. Recording
- `MediaRecorder` with feature detection and mime fallback (`audio/webm;codecs=opus` then `audio/mp4`; same for video). Handle permission denial gracefully. Admin verse form offers both **Record** and **Attach file** for audio and video.

## Frontend Conventions
- Mobile-first; test at 360px, 768px, 1280px.
- Visual design: devotional-modern; saffron/gold on deep maroon/indigo; subtle mandala patterns; glassmorphism; dark and light themes via CSS variables.
- Interactive polish: Framer Motion transitions, animated progress rings, live waveform, confetti on approval/completion, skeleton loaders, illustrated empty states, reduced-motion support.
- Indic script support (Noto Sans Devanagari etc.; `lang` attributes). WCAG 2.1 AA.
- PWA: manifest, icons, standalone display, service worker with offline shell and metadata caching, install prompt, update toast.
- Server state via TanStack Query + Firestore listeners; UI state via Zustand.

## Functions Conventions
- Python 3.12, type hints, pydantic for request validation, consistent error codes via `https_fn.HttpsError`.
- Every callable verifies `request.auth` and the `role` claim first. Log structured JSON; never log tokens or PII.
- Write an `auditLogs` entry for admin actions. Keep functions small; Drive code lives in a `drive/` module behind a `StorageProvider` interface with `GoogleDriveProvider` and `LocalMockProvider`.

## Workflow Expectations for Claude Code
- Work in phases (see `docs/CLAUDE_CODE_PROMPT.md`); after each phase run `pytest functions`, web typecheck/lint/tests and rules tests, and fix failures before moving on.
- Ask before adding major dependencies or changing the architecture.
- Small commits with conventional messages (`feat:`, `fix:`, `chore:`).
- Keep `MOCK_DRIVE=true` working so everything is demoable on the emulators without Google credentials.
- Update `README.md` with Firebase project setup, Google Cloud OAuth setup (enable Drive API and Picker API, consent screen, authorised redirect URI = the `drive_oauth_callback` URL), Secret Manager commands, and `firebase deploy` steps.

## Definition of Done
Works on mobile and desktop, has loading/empty/error states, covered by tests for key logic and authorisation (including rules tests), respects anonymity and access rules, and is documented if it changes setup.
