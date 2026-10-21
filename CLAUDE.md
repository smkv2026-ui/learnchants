# CLAUDE.md: Learn Chants

Guidance for Claude Code when working in this repository. Read `docs/BRD.md` for full requirements before making significant changes.

## Project Summary
Learn Chants is a responsive, installable PWA for learning Vedic/devotional chants verse by verse. Admins (teachers) author playlists with audio/video/meaning; media is stored in Firestore (built-in, chunked) or optionally in the teacher's Google Drive in a folder tree mirroring the playlist hierarchy. Learners loop-listen (3x), record their own chanting (3x), send feedback, receive corrections, and see progress. Some playlists are paid via UPI with manual admin approval.

## Architecture: Firebase Spark (free) plan only — no server code
Owner decision (Oct 2026): run on the free Spark plan and **give up teacher anonymity**. There is no Node.js server and no Cloud Functions; the Python Functions edition lives in git history (commit `f6dd783`).

- **Hosting**: Firebase Hosting serves the PWA (`<project>.web.app`).
- **Auth**: Firebase Authentication (email/password + Google). Roles come from `adminUsers/{uid}` records (`ADMIN`/`SUPER_ADMIN`, `status: active`), checked by the rules on every request. No custom claims.
- **Database + backend**: Cloud Firestore. `firestore.rules` is the backend: it validates every trusted write (roles, invites, payments, grants, reviews, progress). Client operations live in `apps/web/src/lib/ops/*` (batches/transactions).
- **Media storage**: built-in Firestore storage (`media/{id}` + `chunks/{n}`, ≤700 KB × 12 ≈ 8.4 MB per file). Optional Google Drive for teachers (browser session token via Google Identity Services, scope `drive.file`, files shared by link). No Cloud Storage (Spark can't create buckets).
- **Owner bootstrap**: `scripts/deploy.sh` writes the owner email into `firestore.rules`; a verified sign-in with it may create its own SUPER_ADMIN record once.
- **Local dev**: Emulator Suite (Auth, Firestore, Hosting).

## Frontend Stack
React 18 + TypeScript + Vite (build tooling only), `vite-plugin-pwa` (Workbox), React Router, TanStack Query, Zustand, Tailwind CSS, Framer Motion, `react-hook-form` + `zod`, `canvas-confetti`, `dnd-kit`, `qrcode.react`, Firebase JS SDK v10 (modular imports: app, auth, firestore, app-check). Live waveforms use the Web Audio AnalyserNode. Enable Firestore offline persistence.

## Repository Layout
```
/apps/web            React PWA (Vite); lib/ops = client operations, lib/media = storage
/firestore.rules     Firestore Security Rules (the backend)
/firestore.indexes.json
/firebase.json       Hosting, Firestore, Emulators config
/scripts             deploy.sh, bootstrap_super_admin.py, seed_demo.py (firebase-admin)
/docs                BRD.md, CLAUDE_CODE_PROMPT.md, architecture notes
```

## Commands
- `pnpm install`; `python3 -m venv scripts/.venv && scripts/.venv/bin/pip install -r scripts/requirements.txt`
- `pnpm emulators`: Auth, Firestore, Hosting locally; `pnpm dev:emu`: Vite dev server against emulators
- `pnpm --filter web test`: web unit tests; `pnpm test:rules`: Firestore rules tests (emulator)
- `pnpm --filter web typecheck` / `lint` / `build`
- `scripts/.venv/bin/python scripts/bootstrap_super_admin.py --emulators`, `scripts/.venv/bin/python scripts/seed_demo.py --emulators`
- `./scripts/deploy.sh <project-id> <owner-email>`: build + deploy Hosting and Firestore rules/indexes

## Environment
- Web `.env` (public config only): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_APPCHECK_SITE_KEY`, `VITE_USE_EMULATORS`, optional `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_APP_ID` (Drive/Picker). No secrets exist in this edition; never commit `.env*.local`.

## Firestore Data Model
- `users/{uid}`: displayName, email, createdAt (self write). Subcollections: `progress/{pid}` (approvedCount: admins only; learners create with 0 and touch lastVerseId/updatedAt), `progress/{pid}/verseStatus/{vid}` (learners may only set SUBMITTED), `notifications` (admins create; learner marks read), `meta/stats` (activityDays).
- `adminUsers/{uid}`: email, displayName, role, status, inviteId. `adminInvites/{token}` (token = secret doc id, unreadable). `adminSettings/{uid}`, `adminPlaylists/{pid}` (ownerUid, Drive folder override), `driveFolders/*` (Drive folder cache), `auditLogs/*` (actorUid must be the writer).
- `playlists/{pid}` (+ inline small `coverUrl`), `payment/info`, `nodes`, `verses` (audioMediaId/videoMediaId, hasAudio/hasVideo), `materials` (mediaId).
- `media/{id}`: purpose, pid, vid, kind, mimeType, uploaderUid, learnerUid, store (`firestore|drive`), size, chunkCount, driveFileId?, status (`uploading|ready`); `media/{id}/chunks/{n}`: data (bytes).
- `accessGrants/{uid_pid}` (admins), `paymentRequests/{uid_pid}` (learner; resubmit after REJECTED), `paymentRefs/{reference}` (uniqueness), `submissions/{id}` (+ `replies` with authorUid, authorLabel "Your Teacher").

## Critical Rules (non-negotiable)

### 1. Rules are the backend
- Every trusted state change must be validated in `firestore.rules`, with tests in `apps/web/tests/rules`. Never rely on client-side checks.
- Privilege writes that could fail (owner bootstrap, invite acceptance) use transactions so rejected writes never appear locally.
- Teacher anonymity is **not** a requirement in this edition, but learners must never read admin-only collections or other learners' data.

### 2. Admin portal is hidden and rules-enforced
- `/admin/*`, lazy-loaded separate chunk, no links from user screens, `noindex`.
- Only admins create invites (single-use, expiring, optionally email-bound). Only SUPER_ADMIN removes admins; admins can't change Super Admins or themselves.

### 3. Media
- Built-in storage limit ~8.4 MB per file; recordings use 64 kbps audio / 360p 350 kbps video. Drive (optional) mirrors `<Root>/<Playlist>/<Node>/…/<Verse>/{audio,video}` and archives learner recordings to `<Playlist>/_Learners/<Name>_<uid>/<Verse>/`.
- Media docs (and so chunks / Drive ids) are readable only by admins, the recording's learner, or learners with playlist access.

### 4. Monetisation
- Free vs Paid per playlist: UPI ID, payee name, amount (INR). No gateway. Learner submits a reference (+ optional screenshot); admin approves/rejects; approval creates the access grant; references are unique unless previously rejected (then flagged).
- UPI deep link: `upi://pay?pa=<id>&pn=<name>&am=<amount>&cu=INR&tn=<note>` plus QR.

### 5. Learning flow
- On verse open: loop audio (and video if present) exactly **3 times** with counter, pause/restart, speed. Same in admin preview.
- Then one learner recording of the verse (single take), preview, re-record, submit. Progress = approved verses / total; only admin approval counts.

### 6. Recording
- `MediaRecorder` with feature detection and mime fallback (`audio/webm;codecs=opus` then `audio/mp4`; same for video). Handle permission denial gracefully. Admin verse form offers Record and Attach for audio and video.

## Frontend Conventions
- Mobile-first; test at 360px, 768px, 1280px.
- Visual design: devotional-modern; saffron/gold on deep maroon/indigo; subtle mandala patterns; glassmorphism; dark and light themes via CSS variables.
- Interactive polish: Framer Motion transitions, animated progress rings, live waveform, confetti on approval/completion, skeleton loaders, illustrated empty states, reduced-motion support.
- Indic script support (Noto Sans Devanagari etc.; `lang` attributes). WCAG 2.1 AA.
- PWA: manifest, icons, standalone display, service worker with offline shell and metadata caching, install prompt, update toast.
- Server state via TanStack Query + Firestore listeners; UI state via Zustand.

## Workflow Expectations for Claude Code
- After changes run web typecheck/lint/tests and `pnpm test:rules`, and fix failures before moving on.
- Ask before adding major dependencies or changing the architecture.
- Small commits with conventional messages (`feat:`, `fix:`, `chore:`).
- Everything must stay demoable on the emulators without Google credentials (built-in Firestore storage).
- Keep `README.md` current: free-plan setup, `scripts/deploy.sh`, optional Drive setup, trade-offs.

## Definition of Done
Works on mobile and desktop, has loading/empty/error states, covered by tests for key logic and authorisation (rules tests for every trusted write), respects access rules, and is documented if it changes setup.
