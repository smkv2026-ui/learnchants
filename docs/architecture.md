# Architecture (Spark / free plan edition)

```
Browser (React PWA, Workbox SW, Firestore offline cache)
  │  Firebase Auth (email/password, Google)          App Check (optional)
  ├──► Firestore — every read/write validated by firestore.rules
  │      content: playlists/{pid}/{nodes,verses,materials,payment}
  │      media:   media/{id} (+ chunks/{n} ≤ 700 KB)       ← learner & teacher files
  │      trust:   adminUsers, adminInvites, accessGrants, paymentRequests, paymentRefs,
  │               submissions(+replies), users/{uid}/{progress,notifications,meta}, auditLogs
  └──► Google Drive API (optional, teacher's session token, scope drive.file)
         teacher uploads + archived learner recordings, shared by link,
         streamed by learners with the API key: /drive/v3/files/{id}?alt=media&key=…
```

There is no server. Operations that used to be Cloud Functions are client batches/transactions in `apps/web/src/lib/ops/*`, and `firestore.rules` decides whether each write is allowed:

| Operation | Client code | Rule guarantees |
|---|---|---|
| Owner becomes Super Admin | `ops/profile.tryBootstrapOwner` (transaction) | token email == owner email in rules, `email_verified` |
| Invite / accept | `ops/admins` | invite id is a 256-bit secret, unreadable; accept must delete it in the same transaction; email + expiry checked |
| Learner recording | `ops/learner.submitRecording` | media owned by learner, ≤12 chunks × 700 KB, immutable once ready; submission references a ready, own recording; status can only be SUBMITTED |
| Review | `ops/review.reviewSubmission` | admin only; reply authored by the acting admin; learners can't approve or change counts |
| Payment | `ops/payments` | `{uid}_{pid}` request, amount == price, reference claimed in `paymentRefs` (unique unless rejected → flagged); only admins approve and create grants |
| Media read | `lib/media.resolveMedia` | admin, the recording's learner, or playlist access (free/published or grant) |

Verse counts (`verseCount` on playlists and nodes) are recomputed by the admin client after structural edits (`ops/content.recountVerses`); learner section progress is derived from verse statuses.

Rules tests: `apps/web/tests/rules/firestore.test.ts`.
