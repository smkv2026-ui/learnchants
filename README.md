# Learn Chants

An installable, offline-capable Progressive Web App for learning Vedic and devotional chants (e.g. Sri Rudram) verse by verse.

- **Teachers (admins)** build a hierarchy (Playlist → sub-playlists → sections → verses), record or attach audio/video for each verse, attach PDFs and notes, and review learner recordings.
- **Learners** browse playlists, hear each verse **exactly 3 times**, chant it **once** in a recording, send it to their teacher, and watch their progress grow as verses are approved.
- Playlists can be **free or paid via UPI** with manual approval.

**This edition runs entirely on Firebase's free Spark plan**: Hosting, Authentication and Cloud Firestore only. There are no Cloud Functions and no Cloud Storage; the Firestore Security Rules are the backend. Media is stored in Firestore (chunked, up to ~8 MB per file), or optionally in the teacher's Google Drive. Teacher anonymity was given up to make this possible (see [Trade-offs](#5-free-plan-trade-offs)). The earlier Blaze-plan version with Python Cloud Functions is in git history (commit `f6dd783`).

```
apps/web            React 18 + TypeScript + Vite PWA (learner app + lazy-loaded admin portal)
firestore.rules     Firestore Security Rules: roles, access, payments, reviews (the "backend")
firestore.indexes.json
firebase.json       Hosting + Firestore + emulators
scripts             deploy.sh, bootstrap_super_admin.py, seed_demo.py
docs                BRD, build prompt, architecture
```

---

## 1. Put it live (free) in ~15 minutes

1. **Create the project**: <https://console.firebase.google.com> → *Add project* (keep the free Spark plan).
2. **Authentication** → *Get started* → enable **Google** and **Email/Password**.
3. **Deploy** from Google Cloud Shell (<https://shell.cloud.google.com>, nothing to install):
   ```bash
   git clone https://github.com/smkv2026-ui/learnchants.git && cd learnchants
   git checkout claude/magical-lovelace-3nl88m
   ./scripts/deploy.sh <your-google-email>      # project learnchants-55af5 (from .firebaserc)
   ```
   For a different project: `./scripts/deploy.sh <project-id> <your-google-email>`.
   It writes your email into the rules, creates the Firestore database (region `asia-south1`; override with `FIRESTORE_LOCATION=…`), builds and deploys, then prints **`https://<project-id>.web.app`**.
4. **Become Super Admin**: open `https://<project-id>.web.app/admin/login` and click **Sign in with Google** with that email. (Only a *verified* sign-in with that exact email can claim Super Admin; email/password accounts are not verified, so use Google.)
5. Create playlists, sections and verses; invite other teachers from **Admins → Invite admin**.

Re-run `./scripts/deploy.sh …` after pulling updates.

### Google Drive (one click)
By default files live in Firestore (up to ~8 MB each). To use your Drive instead, a teacher clicks **Connect Google Drive** (Admin → Settings, the verse editor, or a playlist's Storage tab) and approves "See and manage files created by this app". This reuses the Firebase Google sign-in; the only requirement is that the **Google Drive API** and **Google Picker API** are enabled (`deploy.sh` does this, or: `gcloud services enable drive.googleapis.com picker.googleapis.com --project <project-id>`).

New teacher uploads then go to `LearnChants/<Playlist>/<Section>/…/<Verse>/audio|video` in that teacher's Drive (shared by link so learners can stream them), and reviewed learner recordings are archived to `<Playlist>/_Learners/<Name>_<uid>/<Verse>/`. The connection lasts for the browser session (about an hour); click the button again when asked.

## 2. Run locally (emulators, no Google account needed)

Prerequisites: Node 20+, pnpm 9+, Python 3.10+, Java 17+, Firebase CLI (`npm i -g firebase-tools`).

```bash
pnpm install
python3 -m venv scripts/.venv && scripts/.venv/bin/pip install -r scripts/requirements.txt

pnpm emulators                       # terminal 1: Auth, Firestore, Hosting (project demo-learnchants)

# terminal 2: first Super Admin + demo content
SUPER_ADMIN_EMAIL=guru@demo.test SUPER_ADMIN_PASSWORD=guru12345 \
  scripts/.venv/bin/python scripts/bootstrap_super_admin.py --emulators
scripts/.venv/bin/python scripts/seed_demo.py --emulators

pnpm dev:emu                         # terminal 3: http://localhost:5173
```

- Learner: `learner@demo.test` / `learner123`. Teacher portal: <http://localhost:5173/admin/login> with `guru@demo.test` / `guru12345`.
- The demo has Sri Rudram (Namakam/Chamakam × 11 anuvakams, sample audio), Gayatri Mantra and Ganesha Pancharatnam (free), and paid Purusha Suktam (₹199), Hanuman Chalisa (₹99) and Vishnu Sahasranamam (₹249).
- Learner guide video with voice-over: `docs/learnchants-learner-guide.mp4`.

## 3. Tests and checks

| Command | What it covers |
|---|---|
| `pnpm test:rules` | **The security model**: Firestore rules tests (starts the Firestore emulator): public vs draft content, paid media locked until a grant, private learner recordings and upload limits, no self-promotion, owner bootstrap only when verified, single-use expiring email-bound invites, deactivated admins, learners can't approve or inflate progress, payment reference uniqueness/resubmission, admin-only approvals |
| `pnpm --filter web test` | Unit/component tests: exactly-3x loop and `LoopPlayer`, resumable Drive upload (resume after network error), UPI deep link, sanitiser, tree/progress roll-ups, sequential unlocking, streaks |
| `pnpm --filter web typecheck` / `lint` / `build` | TypeScript, ESLint, production build + service worker |

## 4. How it works
- **Roles**: an active `adminUsers/{uid}` record makes someone an admin; the rules check it on every request. The first Super Admin is the owner email in `firestore.rules` (verified sign-in). Others join via invites (random 256-bit token; the rules validate email, expiry and single use). Only a Super Admin can remove admins; admins can't touch Super Admins.
- **Hidden admin portal**: `/admin/*` is a separate lazy chunk, never linked from learner screens and marked `noindex`; authorisation is enforced by the rules, not by hiding.
- **Media**: `media/{id}` is a registry; bytes are in `media/{id}/chunks/{n}` (≤700 KB each, ≤12 chunks) or in Drive (`driveFileId`). The rules only reveal a media doc (and so its chunks or Drive id) to admins, the learner who recorded it, or learners with access to the playlist (paid playlists need an approved grant).
- **Payments**: one request per learner and playlist (`paymentRequests/{uid}_{pid}`). The reference is claimed in `paymentRefs/{ref}` in the same batch, so it can't be reused while pending or approved; reusing a rejected reference is allowed but flagged. The rules check the amount equals the playlist price. Approval writes the access grant.
- **Reviews and progress**: teachers' approvals update the learner's verse status and approved count (learners can only ever mark a verse "submitted"). Section and playlist progress are computed from verse statuses and the tree.
- **Offline**: app shell via service worker; Firestore offline persistence also caches verse audio stored in Firestore, so recently played verses work offline.

## 5. Free-plan trade-offs
- **Teacher anonymity is not guaranteed.** Learners still never see admin records, but replies store the teacher's uid, and Drive files (if used) are owned by the teacher's Google account.
- **Paid content protection is weaker**: anyone with access can save the audio, and a Drive link (if used) works for anyone it's shared with.
- **Quotas** (Spark, per day): 50k document reads, 20k writes, 1 GiB stored. A verse play reads 1-2 chunk documents (cached afterwards); a 1-minute recording is ~0.5 MB. This suits a class of tens of learners. Connect Drive and let reviews archive recordings to keep Firestore storage low.
- **Drive connection is per browser session** (no server to hold a refresh token): teachers click "Connect Google Drive" when they need it.
- **Admin removal** takes effect immediately (rules check the record on every request).
- Upgrading later to Blaze needs no data migration for content; the Functions-based edition is in git history.

## 6. Decisions and defaults
- **Learner recording** = one take of the verse (listen 3×, chant 1×); learners can listen back and re-record before sending.
- **Paid access** is lifetime until an admin revokes it. **Sequential unlocking** is optional per playlist (UI-enforced).
- Covers are stored inline as small WebP images (Spark has no Cloud Storage).
- Learner recordings use 64 kbps audio / 360p 350 kbps video to fit built-in storage.

## 7. Troubleshooting
- *Hosting upload “retries exhausted”*: lower parallel uploads and re-run: `FIREBASE_HOSTING_UPLOAD_CONCURRENCY=2 firebase deploy --only hosting,firestore` (deploy.sh already uses 4).
- *“You don’t have permission to do that”* when becoming admin: sign in with **Google** using exactly the email passed to `deploy.sh`.
- *“File is too large for built-in storage”*: connect Google Drive (teachers) or record a shorter take.
- *“The free daily quota has been reached”*: wait until the quota resets (midnight Pacific time) or upgrade to Blaze.
- Microphone/camera need HTTPS (`*.web.app`) or `localhost`.
