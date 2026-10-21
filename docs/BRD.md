# Business Requirements Document (BRD): Learn Chants

Version 1.0 | Date: 19 Oct 2026 | Status: Draft for build

> **Edition note (Oct 2026):** the owner chose to run on Firebase's free Spark plan and gave up teacher anonymity (section 6.8) to do so. There are no Cloud Functions; media defaults to built-in Firestore storage with Google Drive optional. See `CLAUDE.md` and `README.md` for the current architecture.

---

## 1. Purpose and Vision

Learn Chants is a responsive Progressive Web App (PWA) that helps learners memorise and correctly chant Vedic/devotional chants (e.g., Sri Rudram) verse by verse. Teachers (admins) curate structured playlists with audio/video/meaning/material. Learners listen on loop, record their own chanting, receive corrections from the teacher, and track progress.

## 2. Business Objectives

1. Digitise guru-to-student chant teaching with a structured, repeatable learning path.
2. Give teachers a simple way to author content and review student recitations.
3. Provide optional monetisation of selected playlists via UPI with manual approval.
4. Keep all media in the teacher's own Google Drive (no proprietary storage cost, teacher owns data).
5. Keep teacher identity anonymous to learners.

## 3. Stakeholders and Roles

| Role | Description |
|---|---|
| Super Admin | First admin (seeded). Can do everything an Admin can, plus remove admins. |
| Admin | Teacher. Creates content, reviews feedback, approves payments, invites other admins. |
| User (Learner) | Browses playlists, learns, records chanting, submits feedback, views progress. |

## 4. Scope

### In Scope
- PWA (installable, offline shell, responsive mobile/tablet/desktop).
- Role-based authentication (admin portal hidden from users).
- Content hierarchy management (playlist > sub-levels > verse).
- Audio/video record or upload per verse; PDFs, scripture/material, descriptions.
- Google Drive storage with mirrored folder structure and configurable location.
- Free vs paid playlists with UPI payment proof and admin approval.
- Learner practice loop (3x playback, 3x learner chanting), feedback submission, admin replies.
- Verse approval and progress dashboard.
- Multi-admin with anonymity towards users.

### Out of Scope (v1)
- Automated UPI payment verification / payment gateway integration.
- Native mobile apps (PWA only).
- Automated pronunciation scoring (AI) — noted as future.
- Live classes.

## 5. Content Model

```
Playlist  (e.g., Sri Rudram)
 └─ Sub-playlist (e.g., Namakam, Chamakam)       [one or more levels, configurable depth]
     └─ Section (e.g., Anuvakam 1 … 11)
         └─ Verse (n per section)
```

Rules:
- Depth is flexible (Playlist > Group > Group > ... > Verse); each node has a name, description, order.
- Verse is always a leaf. A verse has: name, details/meaning, audio, video (optional), order.
- Playlist-level extras: description of meaning, PDFs, scripture/material, cover image, free/paid setting.

## 6. Functional Requirements

### 6.1 Authentication and Access
- FR-A1: Users sign up/sign in (email + password; Google Sign-In optional).
- FR-A2: Admin sign-in is a separate, unlinked route (`/admin/login`); never shown in user UI or navigation.
- FR-A3: Only an existing admin can create/invite another admin (invite link or temporary credential). Users cannot self-promote.
- FR-A4: Admin data and actions are protected by Firestore Security Rules and Cloud Functions that check the `role` claim; client-side hiding is not relied upon.
- FR-A5: Admins can view, deactivate, or remove other admins (Super Admin for removal).

### 6.2 Admin: Content Management
- FR-C1: Create/edit/delete/reorder playlists and nested classifications (drag-and-drop reordering).
- FR-C2: Create the classification tree first, then add verses under any leaf-level node.
- FR-C3: Verse form: Name, Details/Meaning of shloka (rich text), Audio, Video.
- FR-C4: Audio input: either **Record** in browser (MediaRecorder, with preview, re-record) or **Attach** a file.
- FR-C5: Video input: either **Record** (camera, preview) or **Attach** a video file.
- FR-C6: Bulk-friendly workflow: "Save and add next verse".
- FR-C7: Attach PDFs, scripture/material, and descriptions at playlist and sub-level.
- FR-C8: Publish/unpublish (draft) per playlist.
- FR-C9: Verse playback in admin preview plays the 3x loop identically to the user experience.

### 6.3 Admin: Google Drive Storage
- FR-D1: Admin connects Google account and selects a Drive parent folder (Google Picker) as the storage root.
- FR-D2: System auto-creates a folder structure mirroring the classification, e.g.
  `LearnChants/Sri Rudram/Namakam/Anuvakam 1/Verse 1/audio.m4a`.
- FR-D3: Renaming/reordering in the app keeps Drive folders consistent (rename Drive folder or maintain ID mapping).
- FR-D4: Storage location can be changed in Settings (global default).
- FR-D5: A new playlist can override the global location with a different Drive folder.
- FR-D6: Learner submissions are stored in the Drive of the admin who owns the playlist, under `<Playlist path>/_Learners/<UserTag>/...` where UserTag = `<Name>_<userId>`.
- FR-D7: Changing location affects only new content by default; offer optional "move existing files".
- FR-D8: Drive token refresh handled automatically; show clear reconnect prompt on failure.

### 6.4 Monetisation (UPI, manual approval)
- FR-M1: Per playlist, admin sets Access = Free or Paid.
- FR-M2: For paid: admin enters UPI ID, payee name, and price (INR).
- FR-M3: Learner sees price and a payment screen showing UPI ID, amount, a QR code, and a "Pay with UPI app" deep link (`upi://pay?...`).
- FR-M4: After paying, learner enters payment reference number (UTR/transaction ID) and optionally a screenshot.
- FR-M5: Request status: Pending, Approved, Rejected (with reason).
- FR-M6: Admin sees a payments queue; approves/rejects. Approval grants access to that playlist for that user.
- FR-M7: Rejected learner can resubmit. Duplicate payment references are flagged.
- FR-M8: Learners see listing, description, materials list and Free/Paid badge for all playlists even before payment; verse content (audio/video) is locked until access.
- FR-M9: Admin can revoke access.

### 6.4a Multi-admin Payments
- Payment approvals are visible to all admins; the payee UPI belongs to the playlist's owner settings. Any admin may approve (audit log records who).

### 6.5 Learner Experience
- FR-U1: Home lists all published playlists (from all admins) with cover, description of meaning, materials, Free/Paid badge, and progress ring if started.
- FR-U2: Tapping a playlist lets the learner traverse classification levels with breadcrumbs, then verses in sequence.
- FR-U3: Opening a verse: shows name, meaning, and plays audio (and video if present) **in a loop 3 times** automatically, with a visible counter (1/3, 2/3, 3/3), pause/restart controls, and playback speed.
- FR-U4: After playback, learner records their own chanting (audio or video) **once** (single take; owner decision Oct 2026, previously three guided rounds).
- FR-U5: Learner reviews their recording and submits it to the admin as feedback.
- FR-U6: Learner receives admin response (corrected feedback: text, audio, or video) and is notified in-app.
- FR-U7: Sequential unlocking is configurable per playlist: the next verse unlocks when the previous is approved (default: optional, not forced).
- FR-U8: Learner can view history of own submissions and responses per verse.

### 6.6 Admin: Feedback and Approval
- FR-F1: Review queue of learner submissions filtered by playlist, learner, status.
- FR-F2: Admin plays the submission, replies with text and/or recorded/attached audio/video.
- FR-F3: Admin sets verse status for that learner: Needs Work or **Approved** (correctly chanted).
- FR-F4: Learner-wise view shows full information and progress (all submissions, replies, approved verses).

### 6.7 Progress Dashboard
- FR-P1: Learner dashboard: overall progress %, per playlist progress, per sub-level progress, streak, verses approved, pending feedback, recent activity.
- FR-P2: Progress % = approved verses / total verses (per node, rolled up).
- FR-P3: Admin dashboard: learners count, pending reviews, pending payments, popular playlists, learner progress table.
- FR-P4: Visual celebration (confetti/animation) upon approval and on completing a section or playlist.

### 6.8 Anonymity
- FR-N1: Learner-facing API responses never contain admin name, email, avatar, or Drive info.
- FR-N2: Feedback replies from admins display as "Your Guru/Teacher" (generic label), regardless of which admin replied.
- FR-N3: Only admins see which admin authored content (audit trail).
- FR-N4: Admin identity is stored only in admin-only data; Firestore Security Rules deny learners access to it.
- FR-N5: Limitation: the UPI ID/payee name is visible to payers by nature; admins are advised to use a neutral organisation/trust UPI ID.

### 6.9 Settings
- Admin: Drive connection and default location, UPI defaults, admin management, profile, theme.
- User: profile, notifications, theme, language (English; Sanskrit script display supported), recording quality.

## 7. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Responsiveness | Mobile-first; works from 360px phones to desktop |
| PWA | Installable, service worker, offline app shell, cached recently played verses (where allowed) |
| Performance | First load < 3s on 4G; media streamed, not fully downloaded |
| Security | HTTPS (Firebase Hosting), Firebase Auth, role custom claims enforced by Firestore Security Rules and Cloud Functions, App Check, input validation, Drive OAuth tokens kept server-side only and encrypted (Secret Manager) |
| Privacy | Learner recordings visible only to admins and the learner; admin identity hidden from learners |
| Accessibility | WCAG 2.1 AA, keyboard friendly, adequate contrast, captions/transcript field for meaning |
| Browser | Latest Chrome, Safari (iOS 16+), Edge, Firefox; MediaRecorder fallbacks for Safari (mp4/aac) |
| Reliability | Resumable uploads, retry on failure, upload progress UI |
| Scalability | Serverless (Firebase Hosting, Firestore, Cloud Functions); Drive API quota handling with backoff; Firestore indexes |
| Compliance | Show consent for mic/camera; privacy policy page |

## 8. UX and Visual Requirements
- Visually rich, devotional-yet-modern theme: saffron/gold, deep maroon/indigo gradients, subtle mandala/lotus patterns, glassmorphism cards.
- Smooth animations (page transitions, card hover/tilt, progress rings, waveform visuals during playback/recording).
- Large friendly playback screen with animated waveform and loop counter.
- Dark and light themes.
- Microinteractions: haptic feel on mobile, confetti on achievements.
- Skeleton loaders and empty states with illustrations.

## 9. Data Entities (high level)
User, Admin(User with role), Playlist, Node (classification, self-referencing tree), Verse, MediaAsset (Drive file refs), Material (PDF/scripture/text), DriveConnection, StorageLocation, AccessGrant, PaymentRequest, Submission, FeedbackReply, VerseApproval, Notification, AuditLog.

## 10. Key Workflows

1. **Authoring**: Admin signs in > connects Drive > creates playlist > builds tree > adds verses (record/attach) > adds PDFs/material > sets Free/Paid > publishes.
2. **Learning**: User browses > opens playlist (pays if needed) > traverses > verse loops 3x > user records 3x > submits.
3. **Review**: Admin opens queue > plays > replies > approves/needs work > progress updates.
4. **Payment**: User pays UPI externally > enters reference > admin approves/rejects > access granted.

## 11. Assumptions
- Admins have Google accounts with sufficient Drive storage.
- UPI payments are made outside the app; verification is manual by the admin.
- Initial language of UI is English; chant text can be Devanagari/other scripts.
- The app runs entirely on Firebase (no self-hosted Node.js backend); the Firebase project is on the Blaze plan.
- Google Drive remains the storage for all media, accessed only via Cloud Functions and direct resumable uploads.

## 12. Risks and Mitigations
| Risk | Mitigation |
|---|---|
| Drive API quota/limits | Backoff, batching, caching metadata in DB |
| Admin Drive token expiry blocks learners' uploads | Auto-refresh; alert admin; queue uploads |
| Large video files on mobile | Resumable upload, compression guidance, size limits |
| Safari recording codec issues | Feature-detect and choose supported mime types |
| Fraudulent payment claims | Admin approval, duplicate reference check, screenshot proof |
| Accidental exposure of admin identity | DTO serialisers for learners, automated tests |

## 13. Acceptance Criteria (summary)
- Admin can build Sri Rudram > Namakam > Anuvakam 1–11 > verses with recorded/attached audio and video, and files appear in matching Drive folders.
- Changing Drive location in settings sends new content to the new folder; per-playlist override works.
- Paid playlist is locked until admin approves a payment request.
- Verse plays exactly 3 times in a loop for learner and admin preview.
- Learner submission lands in `_Learners/<UserTag>` in Drive; admin reply is visible to learner.
- Approval increments learner progress at verse, section, and playlist levels.
- No learner-facing response exposes admin identity.
- Admin portal is not reachable from the user UI and rejects non-admin tokens.
- App installs as PWA and passes Lighthouse PWA checks.

## 14. Open Questions
1. Should the learner's "chant thrice" be three separate recordings or one recording with three repetitions? (Default: one recording guided by a 3-round on-screen counter; configurable later.) **Resolved (Oct 2026): a single recording, chanted once.**
2. Should paid access be one-time or time-limited? (Default: lifetime.)
3. Should sequential verse unlocking be mandatory? (Default: optional per playlist.)
4. Hosting: **decided** — Firebase (Hosting, Auth, Firestore, Cloud Functions in Python, no Node.js server). Cloud Functions require the Blaze (pay-as-you-go) plan.

## 15. Technology Decisions
- Frontend: React + TypeScript PWA hosted on Firebase Hosting.
- Backend: Firebase Auth, Cloud Firestore, Cloud Functions (Python), Secret Manager, App Check.
- Media: Google Drive (Drive API v3) with a mirrored folder structure; Firebase Storage only for public cover images.
- Payments: manual UPI proof and admin approval; no gateway.

## 16. Future Enhancements
AI pronunciation scoring, live classes, multi-language UI, certificates on completion, payment gateway automation, community leaderboards.
