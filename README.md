# Learn Chants

An installable, offline-capable Progressive Web App for learning Vedic and devotional chants (e.g. Sri Rudram) verse by verse.

- **Teachers (admins)** build a hierarchy (Playlist → sub-playlists → sections → verses), record or attach audio/video for each verse, attach PDFs and notes, and review learner recordings.
- **Learners** browse playlists, hear each verse **exactly 3 times**, chant it **3 times** in a guided recording, send it to their teacher, and watch their progress grow as verses are approved.
- **Media lives in the teacher's Google Drive**, in folders that mirror the hierarchy. Playlists can be **free or paid via UPI** with manual approval. **Teacher identity is never shown to learners.**

The stack is Firebase only: Hosting, Auth, Firestore, Cloud Functions (Python 3.12), Storage (cover images only) and App Check. There is no Node.js/Express server. Requirements live in [`docs/BRD.md`](docs/BRD.md); architecture notes in [`docs/architecture.md`](docs/architecture.md).

```
apps/web            React 18 + TypeScript + Vite PWA (learner app + lazy-loaded admin portal)
functions           Python Cloud Functions (lc/ business logic, drive/ storage providers, tests/)
firestore.rules     Firestore Security Rules (primary authorisation layer)
storage.rules       Storage rules (public cover images only)
firebase.json       Hosting (+ rewrites to functions), Functions, Emulators
scripts             bootstrap_super_admin.py, seed_demo.py
docs                BRD, build prompt, architecture
```

---

## 1. Run it locally in 5 minutes (no Google credentials needed)

Prerequisites: Node 20+, pnpm 9+, Python 3.12, Java 17+ (for the emulators), Firebase CLI (`npm i -g firebase-tools`).

```bash
# install
pnpm install
python3.12 -m venv functions/venv
functions/venv/bin/pip install -r functions/requirements-dev.txt
cp functions/.secret.local.example functions/.secret.local    # emulator-only secret values

# terminal 1: Auth, Firestore, Functions, Hosting, Storage emulators (project "demo-learnchants")
pnpm emulators

# terminal 2: first Super Admin + demo content (Sri Rudram > Namakam/Chamakam > 11 anuvakams, a paid playlist, demo learner)
SUPER_ADMIN_EMAIL=guru@demo.test SUPER_ADMIN_PASSWORD=guru12345 \
  functions/venv/bin/python scripts/bootstrap_super_admin.py --emulators
functions/venv/bin/python scripts/seed_demo.py --emulators

# terminal 3: the web app against the emulators
pnpm dev:emu            # http://localhost:5173
```

- Learner: `learner@demo.test` / `learner123` (or sign up).
- Teacher portal: **http://localhost:5173/admin/login** (deliberately not linked anywhere in the learner UI) with `guru@demo.test` / `guru12345`.
- `functions/.env.demo-learnchants` sets `MOCK_DRIVE=true`, so "Drive" files are written to **`.mock_drive/`** in the repo root using the same mirrored folder structure, e.g. `.mock_drive/LearnChants/Sri Rudram/Namakam/Anuvakam 1/Verse 2/audio/audio.wav` and learner recordings under `.mock_drive/LearnChants/Sri Rudram/_Learners/<Name>_<uid>/Verse 2/…`.
- To test the production build through Hosting rewrites instead: `pnpm --filter web build:emu`, then open http://127.0.0.1:5000.

## 2. Tests and checks

| Command | What it covers |
|---|---|
| `functions/venv/bin/python -m pytest functions` (`pnpm test:functions`) | 74 tests: every callable's authorisation, invites/roles, uploads + mirrored Drive folders, storage relocation/override/move, signed media URLs + HTTP Range, payments (duplicate refs, resubmission, revoke), review + progress roll-ups, triggers, and an anonymity scan of all learner-readable data and responses |
| `pnpm --filter web test` | Unit/component tests: exactly-3x loop logic and `LoopPlayer`, resumable upload (chunking + resume after network error), UPI deep link, sanitiser, tree/reorder, sequential unlocking, streaks |
| `pnpm test:rules` | Firestore rules tests (`@firebase/rules-unit-testing`, starts the Firestore emulator): each role, forged/stale admin claims, functions-only collections, no identity fields in learner-readable docs |
| `pnpm --filter web typecheck` / `lint` / `build` | TypeScript, ESLint, production build + service worker |

## 3. Deploy to Firebase (live URL)

### 3.1 Firebase project
1. Create a project at <https://console.firebase.google.com> and **upgrade it to the Blaze (pay-as-you-go) plan**. Cloud Functions require Blaze; a small app usually stays within the free usage tiers.
2. **Authentication** → Sign-in method: enable *Email/Password* and *Google*. Add your hosting domain to *Authorized domains* (the `*.web.app` domain is added automatically).
3. **Firestore Database** → create (production mode, region of your choice).
4. **Storage** → get started (used only for public cover images).
5. **Hosting** → get started.
6. **App Check** → register the web app with **reCAPTCHA v3**, copy the site key into `VITE_APPCHECK_SITE_KEY`. After verifying traffic, enforce App Check for Firestore/Storage in the console and set `ENFORCE_APP_CHECK=true` in `functions/.env.<project-id>` to enforce it on callable functions.
7. Project settings → *Your apps* → add a **Web app**; copy its config into `apps/web/.env.local` (see `apps/web/.env.example`).

```bash
firebase login
firebase use --add            # select your project, alias "default"
```

### 3.2 Google Cloud setup for Drive
In <https://console.cloud.google.com> for the same project:
1. **APIs & Services → Library**: enable **Google Drive API** and **Google Picker API**.
2. **OAuth consent screen**: External (or Internal for Workspace), add scope `https://www.googleapis.com/auth/drive.file`; while in *Testing* add your teachers as test users (or publish the app).
3. **Credentials → Create OAuth client ID → Web application**:
   - Authorised JavaScript origins: `https://<project-id>.web.app` (and `http://localhost:5173` for development).
   - Authorised redirect URI: **`https://<project-id>.web.app/drive/callback`**. Firebase Hosting rewrites this path to the `drive_oauth_callback` function (you may instead register the function URL `https://us-central1-<project-id>.cloudfunctions.net/drive_oauth_callback`, but then set `APP_URL` accordingly).
4. **Credentials → Create API key**, restrict it to the Picker API and your web origin → `VITE_GOOGLE_API_KEY`.
5. Put the OAuth client id in `VITE_GOOGLE_CLIENT_ID` and the **project number** in `VITE_GOOGLE_APP_ID`.

### 3.3 Secrets and params
```bash
firebase functions:secrets:set GOOGLE_CLIENT_ID          # OAuth client id
firebase functions:secrets:set GOOGLE_CLIENT_SECRET      # OAuth client secret
firebase functions:secrets:set TOKEN_ENCRYPTION_KEY      # e.g. `openssl rand -base64 32` (AES-256-GCM for Drive refresh tokens)
firebase functions:secrets:set MEDIA_TOKEN_SECRET        # e.g. `openssl rand -base64 48` (HMAC for media URLs + OAuth state)

cp functions/.env.example functions/.env.<project-id>
# edit: APP_URL=https://<project-id>.web.app, MOCK_DRIVE=false, ENFORCE_APP_CHECK=true|false
```
`MOCK_DRIVE` must be `false` in production (Cloud Functions disks are ephemeral).

### 3.4 Build and deploy
```bash
python3.12 -m venv functions/venv && functions/venv/bin/pip install -r functions/requirements.txt   # the CLI packages this venv
pnpm install && pnpm build                 # apps/web/dist
firebase deploy                            # hosting, functions, firestore rules + indexes, storage rules
```
The live app is at `https://<project-id>.web.app`.

Create the first Super Admin against production using Application Default Credentials (`gcloud auth application-default login`):
```bash
SUPER_ADMIN_EMAIL=you@example.org SUPER_ADMIN_PASSWORD='choose-one' \
  functions/venv/bin/python scripts/bootstrap_super_admin.py --project <project-id>
```
Then sign in at `/admin/login`, open **Settings → Connect Google Drive**, and choose (or create) the root folder. Invite more teachers from **Admins → Invite admin** (single-use links that expire after 7 days).

## 4. How things work (short)
- **Roles** are `role` custom claims (`SUPER_ADMIN`, `ADMIN`, `USER`) set only by functions/scripts. New sign-ups call `init_profile`, which assigns `USER`. Rules additionally require an *active* `adminUsers/{uid}` record, so deactivating an admin takes effect immediately.
- **Hidden admin portal**: `/admin/*` is a separate lazy chunk, never linked from learner screens, marked `noindex`; every function re-checks the role claim.
- **Uploads**: `create_upload_session` resolves the target folder (per-playlist override → admin's default → auto-created `LearnChants`), creates mirrored folders idempotently (ids cached by entity id so renames stay in sync), and returns a Drive **resumable session URI**; the browser uploads straight to Drive in 4 MB chunks with progress, retry and resume; `finalize_upload` locates the file by its `mediaId` app property and records metadata.
- **Playback**: `get_media_url` checks access (paid playlists need an approved grant; admins exempt) and returns `/media/<HMAC-signed 15-minute token>`; `stream_media` streams from Drive with HTTP Range support. Clients never see Drive ids, links or tokens.
- **Anonymity**: learner-readable documents have no author/owner fields (rules reject them); replies are labelled "Your Teacher"; the acting admin is recorded only in `auditLogs`.

## 5. Decisions and defaults (from the BRD's open questions)
- **Chant thrice** = one recording with an on-screen Round 1/2/3 counter (“Next round” between repetitions).
- **Paid access** is lifetime (until an admin revokes it).
- **Sequential unlocking** is optional per playlist (off by default). It is a learning aid enforced in the UI.
- **Materials**: the list is visible to everyone; opening a material *file* of a paid playlist requires access (text notes are always readable).
- **Duplicate payment references**: a reference already *pending/approved* is rejected; re-using a *rejected* reference is allowed but flagged for the admin.
- **Deleting content** moves the verse's Drive files to the Drive trash (recoverable); learner submissions are kept. Deleting a whole playlist leaves its Drive folder in place.
- **Storage location changes** apply to new uploads; “move existing files” is explicit (Settings, or per playlist).
- Learner progress per verse is stored at `users/{uid}/progress/{pid}/verseStatus/{vid}` (named `verseStatus` instead of `verses` so collection-group queries don't collide with `playlists/*/verses`).
- `wavesurfer.js` was not needed: live waveforms use the Web Audio `AnalyserNode` for both playback and recording, which also works with streamed Range responses.
- Recently played media is not cached by the service worker: media URLs are short-lived signed tokens. The app shell, fonts, covers and Firestore metadata (offline persistence) work offline.

## 6. Troubleshooting
- *“The teacher's storage is not connected”*: the playlist owner must connect Drive in Settings (or use `MOCK_DRIVE=true` locally).
- *Red “Reconnect Drive” banner*: the refresh token was revoked/expired; click **Reconnect Drive**.
- *Functions emulator can't find Python*: create `functions/venv` with Python 3.12 as shown above.
- *Microphone/camera blocked*: browsers only allow recording on HTTPS or `localhost`.
