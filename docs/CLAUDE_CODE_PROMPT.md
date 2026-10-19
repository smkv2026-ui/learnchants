# Claude Code Prompt: Build "Learn Chants" PWA (Firebase + Google Drive)

Paste everything below the line into Claude Code, from an empty project folder. Before you start, copy `CLAUDE.md` to the project root and `BRD.md` to `docs/BRD.md`; save this prompt as `docs/CLAUDE_CODE_PROMPT.md`.

---

You are building **Learn Chants**, a responsive, installable, visually stunning Progressive Web App that helps people learn chants (e.g., Sri Rudram) verse by verse.

First read `CLAUDE.md` (architecture, stack and rules) and `docs/BRD.md` (full requirements). They are the source of truth. **Do not create a Node.js/Express server.** The backend is Firebase only (Hosting, Auth, Firestore, Cloud Functions written in Python), with Google Drive as the media store. If anything is ambiguous, choose the default stated in the BRD's Open Questions and note it in the README; do not stop to ask unless it blocks progress.

## Product in one paragraph
Admins (teachers) build a hierarchy: **Playlist > sub-playlists > sections > verses** (example: Sri Rudram > Namakam / Chamakam > Namakam has 11 Anuvakams > each Anuvakam has n verses). They create the classification first, then add verses. Each verse has a name, details/meaning, audio (record in browser OR attach file) and video (record OR attach file). Admins also attach PDFs, scriptures/material and descriptions. All media is saved into the admin's Google Drive in a folder structure mirroring the hierarchy. Learners browse playlists, traverse the hierarchy, play each verse (auto-looped 3 times), then record themselves chanting it 3 times and send it to the admin as feedback. Admins reply with corrections and approve verses; approvals drive a progress dashboard. Playlists may be free or paid (UPI ID + price); learners pay externally, enter the payment reference number, and an admin approves or rejects before access is granted. Multiple admins are supported, and their identity is never revealed to learners.

## Build in these phases. After each phase run `pytest functions`, web typecheck/lint/tests and Firestore rules tests, fix problems, then commit.

### Phase 0: Foundation
- Create the layout from CLAUDE.md: `apps/web` (React + TS + Vite), `functions` (Python 3.12), `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `scripts`, `docs`.
- Configure the Firebase Emulator Suite (Auth, Firestore, Functions, Hosting) and make the web app connect to emulators when `VITE_USE_EMULATORS=true`.
- Firebase Auth (email/password + Google). Role custom claims (`SUPER_ADMIN`, `ADMIN`, `USER`) assigned only by functions. Default new signups to `USER`.
- `scripts/bootstrap_super_admin.py` to create the first Super Admin, and `scripts/seed_demo.py` for a demo Sri Rudram > Namakam (11 anuvakams, a few sample verses) and a demo learner.
- Drive abstraction in `functions/drive/`: `StorageProvider` interface with `GoogleDriveProvider` and `LocalMockProvider` (`MOCK_DRIVE=true`).
- Design system: Tailwind tokens (saffron/gold, maroon, indigo), dark/light mode, Devanagari-friendly typography, reusable components (Button, Card, Modal, Tabs, Breadcrumbs, ProgressRing, Toast, Skeleton, EmptyState).
- PWA: manifest, icons, service worker, offline shell, Firestore offline persistence, install prompt, update toast. Enable App Check.

### Phase 1: Security rules and admin management
- Write Firestore Security Rules for the data model in CLAUDE.md. Learners can read only published content, their own submissions, progress, grants and notifications; admin-only and functions-only collections are denied to learners.
- Hidden `/admin/login` route (no links from user UI), separate lazy-loaded admin bundle.
- Functions `create_admin_invite`, `accept_admin_invite`, `deactivate_admin`, `remove_admin` (Super Admin only). Only existing admins can add admins. Audit log for admin actions.
- Rules tests (`@firebase/rules-unit-testing`) covering each role and the anonymity guarantees.

### Phase 2: Content authoring
- Playlist CRUD: title, description of meaning, cover image (Firebase Storage), Free/Paid, draft/published.
- Classification tree builder with unlimited nesting, drag-and-drop reorder, inline rename, breadcrumbs. Guide the admin to create the tree first, then verses.
- Verse form: name, details/meaning (rich text, Indic-script friendly), **audio: Record or Attach**, **video: Record or Attach**. Recording UI with live waveform/camera preview, timer, re-record, playback preview. "Save and add next verse" for bulk entry.
- Materials: attach PDFs, scripture/material files and text descriptions at playlist and node level.
- Admin preview using the same 3x loop player the learner sees.
- Triggers that maintain `verseCount` and progress totals.

### Phase 3: Google Drive storage (Cloud Functions, Python)
- Google OAuth2 connect flow (scope `drive.file`) via `drive_auth_url` and `drive_oauth_callback`; Google Picker so the admin selects the parent folder. Tokens stored encrypted, never sent to the client.
- `ensure_folder_path` creates the mirrored structure `<Root>/<Playlist>/<Node>/.../<Verse>/audio|video` idempotently and caches folder IDs.
- `create_upload_session` returns a Drive resumable-upload session URI (the browser uploads straight to Drive with progress and retry); `finalize_upload` records metadata.
- `get_media_url` + `stream_media`: short-lived signed URLs, access checks, HTTP Range streaming from Drive. No Drive links exposed.
- Settings page: change default storage location; per-playlist override when creating/editing a playlist; optional "move existing files".
- Reconnect-Drive banner on token expiry; exponential backoff on quota errors.

### Phase 4: Monetisation
- Free or Paid per playlist (UPI ID, payee name, INR amount); note in the admin UI that the UPI payee name is visible to payers, so a neutral organisation UPI ID is recommended.
- Learner payment screen: amount, UPI ID, generated QR, "Pay with UPI app" deep link, and a form for payment reference number (+ optional screenshot stored in Drive).
- Functions `submit_payment_request` (duplicate-reference check), `review_payment` (approve/reject with reason, creates access grant), `revoke_access`.
- Admin payments queue. `get_media_url` enforces grants; paid playlist metadata, description, materials list and badge remain visible to everyone.

### Phase 5: Learner experience
- Signup/login, home with beautiful playlist cards (cover, meaning description, materials, Free/Paid badge, progress ring).
- Hierarchy traversal with breadcrumbs, sequential verse list with status chips (Not started, Submitted, Needs work, Approved), optional sequential unlocking per playlist.
- **Verse player**: loops audio/video exactly 3 times with counter (1/3, 2/3, 3/3), animated waveform, pause/restart, speed control, meaning/details shown.
- **Practice**: guided 3-round recording (audio or video), preview, re-record, submit. Uploads go to the owning admin's Drive under `_Learners/<Name>_<uid>/...`.
- History of own submissions and teacher responses per verse.

### Phase 6: Feedback, approval, dashboards
- Admin review queue (filters: playlist, learner, status) with player, text reply, optional recorded/attached audio/video reply, and Approve / Needs Work via `review_submission`.
- In-app notifications for replies and approvals.
- Learner dashboard: overall progress, per-playlist and per-section progress rings, verses approved, streak, pending feedback, recent activity. Confetti and celebration on approvals and on completing a section/playlist.
- Admin dashboard: learner count, pending reviews, pending payments, learner-wise progress table with drill-down to all their submissions.

### Phase 7: Anonymity, security, polish
- Verify with tests that no learner-readable document or function response contains admin identifiers or Drive IDs; replies labelled "Your Teacher".
- Authorisation tests for every function and for locked media.
- Accessibility pass (keyboard, labels, reduced motion, contrast), performance pass (code splitting, image optimisation), Lighthouse PWA check.
- Empty, loading and error states everywhere; responsive check at 360 / 768 / 1280 px.

### Phase 8: Deployment and docs
- `README.md`: Firebase project creation, enabling Auth providers/Firestore/Functions/Hosting/App Check, upgrading to the Blaze plan (required for Cloud Functions), Google Cloud setup (enable Drive API and Picker API, OAuth consent screen, redirect URI = the `drive_oauth_callback` URL, API key), `firebase functions:secrets:set` commands, `MOCK_DRIVE` mode, and `firebase deploy` steps to get the live URL.
- `.env.example`, bootstrap/seed instructions, short architecture note in `docs/`.

## Visual and UX direction
Make it visually impressive, interactive and appealing: devotional-modern aesthetic with saffron/gold accents on deep maroon and indigo gradients, subtle mandala/lotus patterns, glassmorphism cards, smooth page transitions, card hover/tilt effects, animated progress rings, live waveforms during playback and recording, confetti on achievements, delightful micro-interactions, skeleton loaders and illustrated empty states. Dark and light themes. Mobile-first with large thumb-friendly controls on the player and recorder.

## Key acceptance checks (verify before finishing)
1. Admin can build Sri Rudram > Namakam > Anuvakam 1-11 > verses with recorded or attached audio/video; files appear in matching Drive folders (or local folders in mock mode).
2. Changing the storage location in Settings works for new content; a per-playlist override works.
3. A paid playlist is locked until an admin approves a payment request; rejected requests can be resubmitted.
4. Each verse plays exactly 3 times in a loop for learners and in admin preview.
5. Learner submissions land under `_Learners/<UserTag>` and the admin reply is visible to the learner.
6. Approval updates progress at verse, section and playlist levels.
7. No learner-facing document or response reveals any admin identity.
8. The admin portal is unreachable from the user UI and rejects non-admin tokens; only an admin can create another admin.
9. The app is deployable with `firebase deploy`, installs as a PWA, works as an offline shell, and is responsive on phone, tablet and desktop.

Start with Phase 0 now. Summarise what you completed at the end of each phase and continue to the next without waiting, unless you hit a blocker that needs my input (for example Firebase project or Google credentials).
