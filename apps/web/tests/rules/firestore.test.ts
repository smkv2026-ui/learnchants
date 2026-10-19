import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Bytes,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const OWNER_EMAIL = 'owner@test.dev';
let env: RulesTestEnvironment;

type U = { uid: string; token: Record<string, unknown> };
const LEARNER: U = { uid: 'learner1', token: { email: 'asha@example.com', email_verified: true } };
const OTHER: U = { uid: 'learner2', token: { email: 'ravi@example.com', email_verified: true } };
const ADMIN: U = { uid: 'admin1', token: { email: 'teacher@example.com' } };
const SUPER: U = { uid: 'super1', token: { email: 'guru@example.com' } };
const DEACTIVATED: U = { uid: 'admin9', token: { email: 'old@example.com' } };
const OWNER: U = { uid: 'owner1', token: { email: OWNER_EMAIL, email_verified: true } };

const as = (u: U): Firestore => env.authenticatedContext(u.uid, u.token).firestore() as unknown as Firestore;
const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore;
const bytes = (n: number) => Bytes.fromUint8Array(new Uint8Array(n));

beforeAll(async () => {
  const rules = readFileSync(resolve(__dirname, '../../../../firestore.rules'), 'utf8').replace(
    "return 'owner@example.invalid';",
    `return '${OWNER_EMAIL}';`,
  );
  env = await initializeTestEnvironment({
    projectId: 'demo-learnchants-rules',
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

const future = () => Timestamp.fromMillis(Date.now() + 3 * 24 * 3600 * 1000);

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const set = (path: string, data: Record<string, unknown>) => setDoc(doc(db, path), data);
    await set('adminUsers/admin1', { role: 'ADMIN', status: 'active', email: 'teacher@example.com' });
    await set('adminUsers/super1', { role: 'SUPER_ADMIN', status: 'active', email: 'guru@example.com' });
    await set('adminUsers/admin9', { role: 'ADMIN', status: 'deactivated', email: 'old@example.com' });
    await set('adminInvites/' + 'i'.repeat(43), { email: 'asha@example.com', createdBy: 'admin1', createdAt: Timestamp.now(), expiresAt: future() });
    await set('adminInvites/' + 'x'.repeat(43), { email: null, createdBy: 'admin1', createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    await set('playlists/pub', { title: 'Sri Rudram', access: 'free', published: true, order: 1, verseCount: 2 });
    await set('playlists/paid', { title: 'Purusha Suktam', access: 'paid', price: 199, published: true, order: 2 });
    await set('playlists/draft', { title: 'Draft', access: 'free', published: false, order: 3 });
    await set('playlists/paid/payment/info', { upiId: 'trust@upi', payeeName: 'Trust' });
    await set('playlists/pub/verses/v1', { nodeId: 'n1', name: 'Verse 1', order: 1, audioMediaId: 'mpub' });
    await set('playlists/draft/verses/dv1', { nodeId: 'x', name: 'Draft verse', order: 1 });
    await set('media/mpub', { purpose: 'verse_audio', pid: 'pub', store: 'firestore', chunkCount: 1, status: 'ready', uploaderUid: 'admin1', learnerUid: null, mimeType: 'audio/webm' });
    await set('media/mpub/chunks/0', { data: bytes(10) });
    await set('media/mpaid', { purpose: 'verse_audio', pid: 'paid', store: 'drive', driveFileId: 'DRIVE123', chunkCount: 0, status: 'ready', uploaderUid: 'admin1', learnerUid: null, mimeType: 'audio/webm' });
    await set('media/mdraft', { purpose: 'verse_audio', pid: 'draft', store: 'firestore', chunkCount: 1, status: 'ready', uploaderUid: 'admin1', learnerUid: null, mimeType: 'audio/webm' });
    await set('media/sub1', { purpose: 'submission', pid: 'pub', store: 'firestore', chunkCount: 1, status: 'ready', uploaderUid: 'learner1', learnerUid: 'learner1', mimeType: 'audio/webm' });
    await set('media/sub1/chunks/0', { data: bytes(10) });
    await set('media/sub2', { purpose: 'submission', pid: 'pub', store: 'firestore', chunkCount: 1, status: 'ready', uploaderUid: 'learner2', learnerUid: 'learner2', mimeType: 'audio/webm' });
    await set('submissions/s1', { uid: 'learner1', pid: 'pub', vid: 'v1', status: 'SUBMITTED', mediaId: 'sub1', replyCount: 0 });
    await set('submissions/s2', { uid: 'learner2', pid: 'pub', vid: 'v1', status: 'SUBMITTED', mediaId: 'sub2', replyCount: 0 });
    await set('submissions/s1/replies/r1', { text: 'Good', authorUid: 'admin1', authorLabel: 'Your Teacher', status: 'APPROVED' });
    await set('submissions/s2/replies/r1', { text: 'Redo', authorUid: 'admin1', authorLabel: 'Your Teacher', status: 'NEEDS_WORK' });
    await set('users/learner1', { displayName: 'Asha', email: 'asha@example.com' });
    await set('users/learner2', { displayName: 'Ravi' });
    await set('users/learner1/progress/pub', { pid: 'pub', uid: 'learner1', approvedCount: 1 });
    await set('users/learner1/progress/pub/verseStatus/v1', { status: 'APPROVED', pid: 'pub' });
    await set('users/learner1/notifications/n1', { type: 'approved', message: 'Approved', read: false });
    await set('accessGrants/learner2_paid', { uid: 'learner2', pid: 'paid' });
    await set('paymentRefs/TAKEN123', { requestId: 'learner2_paid', uid: 'learner2', status: 'APPROVED' });
    await set('auditLogs/a1', { actorUid: 'admin1', action: 'x' });
    await set('driveFolders/f1', { folderId: 'drv' });
    await set('adminSettings/admin1', { defaultFolderId: 'drv' });
  });
});

describe('content visibility', () => {
  it('published playlists are public, drafts admin-only, lists must filter', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'playlists/pub')));
    await assertFails(getDoc(doc(as(LEARNER), 'playlists/draft')));
    await assertFails(getDoc(doc(as(LEARNER), 'playlists/draft/verses/dv1')));
    await assertSucceeds(getDoc(doc(as(ADMIN), 'playlists/draft')));
    await assertSucceeds(getDocs(query(collection(as(LEARNER), 'playlists'), where('published', '==', true))));
    await assertFails(getDocs(collection(as(LEARNER), 'playlists')));
  });

  it('learners cannot write content', async () => {
    await assertFails(updateDoc(doc(as(LEARNER), 'playlists/pub'), { title: 'Hacked' }));
    await assertFails(setDoc(doc(as(LEARNER), 'playlists/pub/verses/v2'), { nodeId: 'n1', name: 'x', order: 2 }));
    await assertFails(setDoc(doc(as(LEARNER), 'playlists/paid/payment/info'), { upiId: 'me@upi', payeeName: 'Me' }));
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'playlists/pub'), { title: 'Sri Rudram', access: 'free' }));
  });

  it('UPI details need sign-in', async () => {
    await assertSucceeds(getDoc(doc(as(LEARNER), 'playlists/paid/payment/info')));
    await assertFails(getDoc(doc(anon(), 'playlists/paid/payment/info')));
  });
});

describe('media access', () => {
  it('free published media is playable, drafts are not', async () => {
    await assertSucceeds(getDoc(doc(as(LEARNER), 'media/mpub')));
    await assertSucceeds(getDocs(collection(as(LEARNER), 'media/mpub/chunks')));
    await assertFails(getDoc(doc(as(LEARNER), 'media/mdraft')));
  });

  it('paid media (incl. the Drive file id) needs an access grant', async () => {
    await assertFails(getDoc(doc(as(LEARNER), 'media/mpaid')));
    await assertFails(getDoc(doc(anon(), 'media/mpaid')));
    await assertSucceeds(getDoc(doc(as(OTHER), 'media/mpaid'))); // learner2 has a grant
    await assertSucceeds(getDoc(doc(as(ADMIN), 'media/mpaid')));
  });

  it('learner recordings are private to the learner and admins', async () => {
    await assertSucceeds(getDoc(doc(as(LEARNER), 'media/sub1')));
    await assertSucceeds(getDocs(collection(as(LEARNER), 'media/sub1/chunks')));
    await assertFails(getDoc(doc(as(OTHER), 'media/sub1')));
    await assertFails(getDocs(collection(as(OTHER), 'media/sub1/chunks')));
    await assertSucceeds(getDoc(doc(as(ADMIN), 'media/sub1')));
  });

  it('learners upload only their own recordings, within limits, then finalise', async () => {
    const db = as(LEARNER);
    const base = { purpose: 'submission', pid: 'pub', kind: 'audio', mimeType: 'audio/webm', uploaderUid: 'learner1', learnerUid: 'learner1', store: 'firestore', status: 'uploading', size: 20, chunkCount: 2 };
    await assertSucceeds(setDoc(doc(db, 'media/new1'), base));
    await assertSucceeds(setDoc(doc(db, 'media/new1/chunks/0'), { data: bytes(10) }));
    await assertSucceeds(setDoc(doc(db, 'media/new1/chunks/1'), { data: bytes(10) }));
    await assertFails(setDoc(doc(db, 'media/new1/chunks/2'), { data: bytes(10) })); // beyond chunkCount
    await assertFails(setDoc(doc(db, 'media/new1/chunks/0'), { data: bytes(5) })); // no overwrite
    await assertFails(setDoc(doc(as(OTHER), 'media/new1/chunks/1'), { data: bytes(10) }));
    await assertSucceeds(updateDoc(doc(db, 'media/new1'), { status: 'ready', durationSec: 3 }));
    await assertFails(setDoc(doc(db, 'media/new1/chunks/1'), { data: bytes(10) })); // immutable once ready
    await assertFails(updateDoc(doc(db, 'media/new1'), { pid: 'paid' }));
    // limits and impersonation
    await assertFails(setDoc(doc(db, 'media/big'), { ...base, chunkCount: 13 }));
    await assertFails(setDoc(doc(db, 'media/new2'), { ...base, chunkCount: 1 }).then(() => setDoc(doc(db, 'media/new2/chunks/0'), { data: bytes(700_001) })));
    await assertFails(setDoc(doc(db, 'media/fake'), { ...base, learnerUid: 'learner2' }));
    await assertFails(setDoc(doc(db, 'media/verse'), { ...base, purpose: 'verse_audio' }));
    await assertFails(setDoc(doc(db, 'media/paid1'), { ...base, pid: 'paid' })); // no grant for paid playlist
  });
});

describe('roles and admin management', () => {
  it('users cannot self-promote', async () => {
    await assertFails(setDoc(doc(as(LEARNER), 'adminUsers/learner1'), { email: 'asha@example.com', role: 'ADMIN', status: 'active', inviteId: null }));
    await assertFails(setDoc(doc(as(LEARNER), 'adminUsers/learner1'), { email: 'asha@example.com', role: 'SUPER_ADMIN', status: 'active', inviteId: null }));
  });

  it('the owner email becomes Super Admin only when verified', async () => {
    const rec = { email: OWNER_EMAIL, displayName: 'Owner', role: 'SUPER_ADMIN', status: 'active', inviteId: null };
    await assertFails(setDoc(doc(as({ uid: 'owner1', token: { email: OWNER_EMAIL, email_verified: false } }), 'adminUsers/owner1'), rec));
    await assertSucceeds(setDoc(doc(as(OWNER), 'adminUsers/owner1'), rec));
  });

  it('invites: admin-only, unreadable, single-use, email-bound and expiring', async () => {
    const token = 'i'.repeat(43);
    await assertFails(getDoc(doc(as(LEARNER), `adminInvites/${token}`)));
    await assertFails(getDoc(doc(as(ADMIN), `adminInvites/${token}`)));
    await assertFails(setDoc(doc(as(LEARNER), `adminInvites/${'z'.repeat(43)}`), { email: null, createdBy: 'learner1', createdAt: serverTimestamp(), expiresAt: future() }));
    await assertSucceeds(setDoc(doc(as(ADMIN), `adminInvites/${'z'.repeat(43)}`), { email: null, createdBy: 'admin1', createdAt: serverTimestamp(), expiresAt: future() }));

    const accept = (u: U, inviteId: string) => {
      const db = as(u);
      const b = writeBatch(db);
      b.set(doc(db, `adminUsers/${u.uid}`), { email: u.token.email, displayName: 'X', role: 'ADMIN', status: 'active', inviteId });
      b.delete(doc(db, `adminInvites/${inviteId}`));
      return b.commit();
    };
    await assertFails(accept(OTHER, token)); // invite bound to asha@
    await assertFails(accept(OTHER, 'x'.repeat(43))); // expired
    await assertFails(
      setDoc(doc(as(LEARNER), 'adminUsers/learner1'), { email: 'asha@example.com', displayName: 'A', role: 'ADMIN', status: 'active', inviteId: token }),
    ); // must consume the invite
    await assertSucceeds(accept(LEARNER, token));
    await assertFails(accept(OTHER, token)); // single use
  });

  it('a deactivated admin record grants nothing', async () => {
    await assertFails(getDoc(doc(as(DEACTIVATED), 'playlists/draft')));
    await assertFails(getDocs(collection(as(DEACTIVATED), 'submissions')));
    await assertFails(updateDoc(doc(as(DEACTIVATED), 'adminUsers/admin9'), { status: 'active' }));
  });

  it('admins (de)activate others; only Super Admins touch Super Admins or remove', async () => {
    await assertFails(updateDoc(doc(as(ADMIN), 'adminUsers/super1'), { status: 'deactivated' }));
    await assertFails(updateDoc(doc(as(ADMIN), 'adminUsers/admin1'), { status: 'deactivated' })); // self
    await assertFails(updateDoc(doc(as(ADMIN), 'adminUsers/admin9'), { role: 'SUPER_ADMIN' }));
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'adminUsers/admin9'), { status: 'active' }));
    await assertFails(deleteDoc(doc(as(ADMIN), 'adminUsers/admin9')));
    await assertSucceeds(deleteDoc(doc(as(SUPER), 'adminUsers/admin9')));
    await assertFails(deleteDoc(doc(as(SUPER), 'adminUsers/super1')));
  });

  it('admin-only collections are closed to learners', async () => {
    for (const p of ['adminUsers/admin1', 'adminSettings/admin1', 'auditLogs/a1', 'driveFolders/f1', 'paymentRefs/TAKEN123']) {
      await assertFails(getDoc(doc(as(LEARNER), p)));
    }
    await assertSucceeds(getDoc(doc(as(ADMIN), 'auditLogs/a1')));
    await assertFails(getDoc(doc(as(SUPER), 'adminSettings/admin1'))); // own settings only
  });

  it('audit entries must name the acting admin', async () => {
    await assertSucceeds(setDoc(doc(as(ADMIN), 'auditLogs/a2'), { actorUid: 'admin1', action: 'x', createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(as(ADMIN), 'auditLogs/a3'), { actorUid: 'super1', action: 'x', createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(as(LEARNER), 'auditLogs/a4'), { actorUid: 'learner1', action: 'x', createdAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as(ADMIN), 'auditLogs/a1'), { action: 'y' }));
  });
});

describe('submissions, review and progress', () => {
  it('learners submit only their own ready recording and cannot approve', async () => {
    const db = as(LEARNER);
    const sub = { uid: 'learner1', pid: 'pub', vid: 'v1', status: 'SUBMITTED', mediaId: 'sub1', replyCount: 0 };
    await assertSucceeds(setDoc(doc(db, 'submissions/new'), sub));
    await assertFails(setDoc(doc(db, 'submissions/x1'), { ...sub, status: 'APPROVED' }));
    await assertFails(setDoc(doc(db, 'submissions/x2'), { ...sub, mediaId: 'sub2' })); // someone else's media
    await assertFails(setDoc(doc(db, 'submissions/x3'), { ...sub, uid: 'learner2' }));
    await assertFails(updateDoc(doc(db, 'submissions/s1'), { status: 'APPROVED' }));
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'submissions/s1'), { status: 'APPROVED', replyCount: 1 }));
  });

  it('learners read only their own submissions and replies', async () => {
    await assertSucceeds(getDoc(doc(as(LEARNER), 'submissions/s1')));
    await assertFails(getDoc(doc(as(LEARNER), 'submissions/s2')));
    await assertSucceeds(getDoc(doc(as(LEARNER), 'submissions/s1/replies/r1')));
    await assertFails(getDoc(doc(as(LEARNER), 'submissions/s2/replies/r1')));
    await assertFails(getDocs(collection(as(LEARNER), 'submissions')));
    await assertSucceeds(getDocs(query(collection(as(LEARNER), 'submissions'), where('uid', '==', 'learner1'))));
  });

  it('only admins reply, as themselves', async () => {
    await assertSucceeds(setDoc(doc(as(ADMIN), 'submissions/s1/replies/r2'), { text: 'ok', authorUid: 'admin1', status: 'APPROVED' }));
    await assertFails(setDoc(doc(as(ADMIN), 'submissions/s1/replies/r3'), { text: 'ok', authorUid: 'super1', status: 'APPROVED' }));
    await assertFails(setDoc(doc(as(LEARNER), 'submissions/s1/replies/r4'), { text: 'self', authorUid: 'learner1', status: 'APPROVED' }));
  });

  it('learners mark verses SUBMITTED but cannot approve or inflate progress', async () => {
    const db = as(LEARNER);
    const vs = { status: 'SUBMITTED', pid: 'pub', nodeId: 'n1', lastSubmissionId: 's1', updatedAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(db, 'users/learner1/progress/pub/verseStatus/v2'), vs));
    await assertFails(setDoc(doc(db, 'users/learner1/progress/pub/verseStatus/v3'), { ...vs, status: 'APPROVED' }));
    await assertFails(setDoc(doc(db, 'users/learner1/progress/pub/verseStatus/v1'), vs)); // can't un-approve
    await assertFails(updateDoc(doc(db, 'users/learner1/progress/pub'), { approvedCount: 99 }));
    await assertSucceeds(updateDoc(doc(db, 'users/learner1/progress/pub'), { lastVerseId: 'v1', updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, 'users/learner1/progress/paid'), { pid: 'paid', uid: 'learner1', approvedCount: 3 }));
    await assertSucceeds(setDoc(doc(db, 'users/learner1/progress/paid'), { pid: 'paid', uid: 'learner1', approvedCount: 0 }));
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'users/learner1/progress/pub'), { approvedCount: 2 }));
    await assertFails(getDoc(doc(as(OTHER), 'users/learner1/progress/pub')));
  });

  it('notifications: admins send, learners only mark read', async () => {
    const n = { type: 'approved', message: 'Hi', link: null, read: false, createdAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(as(ADMIN), 'users/learner1/notifications/n2'), n));
    await assertFails(setDoc(doc(as(LEARNER), 'users/learner1/notifications/n3'), n));
    await assertSucceeds(updateDoc(doc(as(LEARNER), 'users/learner1/notifications/n1'), { read: true }));
    await assertFails(updateDoc(doc(as(LEARNER), 'users/learner1/notifications/n1'), { message: 'changed' }));
  });
});

describe('payments', () => {
  const request = (u: U, reference: string, extra: Record<string, unknown> = {}) => ({
    uid: u.uid,
    userName: 'A',
    pid: 'paid',
    playlistTitle: 'Purusha Suktam',
    amount: 199,
    reference,
    screenshotMediaId: null,
    status: 'PENDING',
    reason: null,
    duplicateFlag: false,
    previousReferences: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...extra,
  });
  const submit = (u: U, reference: string, extra: Record<string, unknown> = {}) => {
    const db = as(u);
    const b = writeBatch(db);
    b.set(doc(db, `paymentRefs/${reference}`), { requestId: `${u.uid}_paid`, uid: u.uid, status: 'PENDING' });
    b.set(doc(db, `paymentRequests/${u.uid}_paid`), request(u, reference, extra));
    return b.commit();
  };

  it('a learner submits a valid request for the exact price', async () => {
    await assertFails(submit(LEARNER, 'UTR4567890', { amount: 1 }));
    await assertFails(submit(LEARNER, 'bad ref'));
    await assertSucceeds(submit(LEARNER, 'UTR4567890'));
    await assertSucceeds(getDoc(doc(as(LEARNER), 'paymentRequests/learner1_paid')));
    await assertFails(getDoc(doc(as(OTHER), 'paymentRequests/learner1_paid')));
    await assertFails(submit(LEARNER, 'UTR0000001')); // already pending
  });

  it('references in use are rejected; reuse after rejection is flagged', async () => {
    await assertFails(submit(LEARNER, 'TAKEN123'));
    await assertFails(submit(LEARNER, 'TAKEN123', { duplicateFlag: true }));
    await assertSucceeds(submit(LEARNER, 'UTR4567890'));
    // admin rejects
    const adb = as(ADMIN);
    const b = writeBatch(adb);
    b.update(doc(adb, 'paymentRequests/learner1_paid'), { status: 'REJECTED', reason: 'not found', reviewedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    b.update(doc(adb, 'paymentRefs/UTR4567890'), { status: 'REJECTED' });
    await assertSucceeds(b.commit());
    await assertFails(submit(LEARNER, 'UTR4567890')); // must be flagged as re-used
    await assertSucceeds(submit(LEARNER, 'UTR4567890', { duplicateFlag: true }));
  });

  it('only admins approve and grant access', async () => {
    await assertSucceeds(submit(LEARNER, 'UTR4567890'));
    await assertFails(updateDoc(doc(as(LEARNER), 'paymentRequests/learner1_paid'), { status: 'APPROVED' }));
    await assertFails(setDoc(doc(as(LEARNER), 'accessGrants/learner1_paid'), { uid: 'learner1', pid: 'paid' }));
    await assertFails(updateDoc(doc(as(ADMIN), 'paymentRequests/learner1_paid'), { status: 'REJECTED', reason: '' }));
    const adb = as(ADMIN);
    const b = writeBatch(adb);
    b.update(doc(adb, 'paymentRequests/learner1_paid'), { status: 'APPROVED', reviewedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    b.update(doc(adb, 'paymentRefs/UTR4567890'), { status: 'APPROVED' });
    b.set(doc(adb, 'accessGrants/learner1_paid'), { uid: 'learner1', pid: 'paid', grantedAt: serverTimestamp() });
    await assertSucceeds(b.commit());
    await assertSucceeds(getDoc(doc(as(LEARNER), 'media/mpaid'))); // now unlocked
    await assertFails(getDoc(doc(as(LEARNER), 'accessGrants/learner2_paid')));
  });
});
