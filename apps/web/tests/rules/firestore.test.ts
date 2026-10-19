import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

const LEARNER = { uid: 'learner1', token: { role: 'USER', email: 'asha@example.com' } };
const OTHER = { uid: 'learner2', token: { role: 'USER' } };
const ADMIN = { uid: 'admin1', token: { role: 'ADMIN', email: 'teacher@example.com' } };
const SUPER = { uid: 'super1', token: { role: 'SUPER_ADMIN' } };
const DEACTIVATED = { uid: 'admin9', token: { role: 'ADMIN' } }; // stale token, record deactivated
const FORGED = { uid: 'mallory', token: { role: 'ADMIN' } }; // claim without an adminUsers record

function as(user: { uid: string; token: Record<string, unknown> }): Firestore {
  return env.authenticatedContext(user.uid, user.token).firestore() as unknown as Firestore;
}
const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-learnchants-rules',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../../../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const set = (path: string, data: Record<string, unknown>) => setDoc(doc(db, path), data);
    await set('adminUsers/admin1', { role: 'ADMIN', status: 'active', email: 'teacher@example.com' });
    await set('adminUsers/super1', { role: 'SUPER_ADMIN', status: 'active' });
    await set('adminUsers/admin9', { role: 'ADMIN', status: 'deactivated' });
    await set('playlists/pub', { title: 'Sri Rudram', access: 'free', published: true, order: 1 });
    await set('playlists/paid', { title: 'Purusha Suktam', access: 'paid', price: 199, published: true, order: 2 });
    await set('playlists/draft', { title: 'Draft', access: 'free', published: false, order: 3 });
    await set('playlists/paid/payment/info', { upiId: 'trust@upi', payeeName: 'Trust' });
    await set('playlists/pub/nodes/n1', { parentId: null, name: 'Namakam', order: 1 });
    await set('playlists/pub/verses/v1', { nodeId: 'n1', name: 'Verse 1', order: 1, audioMediaId: 'm1', hasAudio: true });
    await set('playlists/pub/verses/v1/media/m1', { kind: 'audio', mimeType: 'audio/webm' });
    await set('playlists/paid/verses/pv1', { nodeId: 'x', name: 'Mantra 1', order: 1 });
    await set('playlists/draft/verses/dv1', { nodeId: 'x', name: 'Draft verse', order: 1 });
    await set('playlists/pub/materials/mat1', { title: 'Text', type: 'text', text: 'Om' });
    await set('adminPlaylists/pub', { ownerUid: 'admin1', createdBy: 'admin1' });
    await set('adminSettings/admin1', { defaultFolderId: 'folder-x', displayName: 'Teacher' });
    await set('driveFiles/m1', { driveFileId: 'drv123', ownerUid: 'admin1' });
    await set('driveFolders/f1', { folderId: 'drv-folder' });
    await set('driveConnections/admin1', { refreshTokenEnc: 'v1.xxx' });
    await set('adminInvites/hash', { email: null });
    await set('auditLogs/a1', { actorUid: 'admin1', action: 'x' });
    await set('accessGrants/learner1_paid', { uid: 'learner1', pid: 'paid' });
    await set('accessGrants/learner2_paid', { uid: 'learner2', pid: 'paid' });
    await set('paymentRequests/r1', { uid: 'learner1', pid: 'paid', reference: 'ABC123', status: 'PENDING' });
    await set('paymentRequests/r2', { uid: 'learner2', pid: 'paid', reference: 'XYZ999', status: 'PENDING' });
    await set('submissions/s1', { uid: 'learner1', pid: 'pub', vid: 'v1', status: 'SUBMITTED', mediaId: 'sm1' });
    await set('submissions/s2', { uid: 'learner2', pid: 'pub', vid: 'v1', status: 'SUBMITTED', mediaId: 'sm2' });
    await set('submissions/s1/replies/r1', { text: 'Good', authorLabel: 'Your Teacher', status: 'APPROVED' });
    await set('submissions/s2/replies/r1', { text: 'Redo', authorLabel: 'Your Teacher', status: 'NEEDS_WORK' });
    await set('users/learner1', { displayName: 'Asha', email: 'asha@example.com' });
    await set('users/learner2', { displayName: 'Ravi' });
    await set('users/learner1/progress/pub', { pid: 'pub', uid: 'learner1', approvedCount: 1, totalCount: 3 });
    await set('users/learner1/progress/pub/verseStatus/v1', { status: 'APPROVED' });
    await set('users/learner1/notifications/n1', { message: 'Your Teacher approved', read: false, type: 'approved' });
    await set('users/learner1/meta/stats', { activityDays: ['2026-10-19'] });
  });
});

describe('public content', () => {
  it('anyone can read published playlists but not drafts', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'playlists/pub')));
    await assertSucceeds(getDoc(doc(as(LEARNER), 'playlists/paid')));
    await assertFails(getDoc(doc(as(LEARNER), 'playlists/draft')));
    await assertFails(getDoc(doc(as(LEARNER), 'playlists/draft/verses/dv1')));
    await assertSucceeds(getDoc(doc(as(ADMIN), 'playlists/draft')));
  });

  it('learner list queries must filter on published', async () => {
    await assertSucceeds(getDocs(query(collection(as(LEARNER), 'playlists'), where('published', '==', true))));
    await assertFails(getDocs(collection(as(LEARNER), 'playlists')));
    await assertSucceeds(getDocs(collection(as(ADMIN), 'playlists')));
  });

  it('paid playlist metadata, verses list and materials stay visible before payment', async () => {
    await assertSucceeds(getDocs(collection(as(OTHER), 'playlists/paid/verses')));
    await assertSucceeds(getDocs(collection(as(LEARNER), 'playlists/pub/materials')));
    await assertSucceeds(getDoc(doc(as(LEARNER), 'playlists/pub/verses/v1/media/m1')));
  });

  it('UPI details require sign-in', async () => {
    await assertSucceeds(getDoc(doc(as(LEARNER), 'playlists/paid/payment/info')));
    await assertFails(getDoc(doc(anon(), 'playlists/paid/payment/info')));
  });

  it('learners cannot write content', async () => {
    await assertFails(updateDoc(doc(as(LEARNER), 'playlists/pub'), { title: 'Hacked' }));
    await assertFails(setDoc(doc(as(LEARNER), 'playlists/pub/verses/v2'), { nodeId: 'n1', name: 'x', order: 2 }));
    await assertFails(setDoc(doc(as(LEARNER), 'playlists/pub/nodes/n2'), { parentId: null, name: 'x', order: 2 }));
    await assertFails(setDoc(doc(as(LEARNER), 'playlists/pub/materials/m2'), { title: 'x', type: 'text' }));
    await assertFails(setDoc(doc(as(LEARNER), 'playlists/paid/payment/info'), { upiId: 'me@upi', payeeName: 'Me' }));
  });
});

describe('admin-only and functions-only collections (anonymity)', () => {
  const adminOnly = ['adminPlaylists/pub', 'adminUsers/admin1', 'adminSettings/admin1', 'auditLogs/a1'];
  const functionsOnly = ['driveFiles/m1', 'driveFolders/f1', 'driveConnections/admin1', 'adminInvites/hash'];

  it('learners cannot read any admin identity or Drive ids', async () => {
    for (const path of [...adminOnly, ...functionsOnly]) {
      await assertFails(getDoc(doc(as(LEARNER), path)));
      await assertFails(getDoc(doc(anon(), path)));
    }
    await assertFails(getDocs(collection(as(LEARNER), 'adminUsers')));
    await assertFails(getDocs(collection(as(LEARNER), 'auditLogs')));
  });

  it('admins read admin-only data but never functions-only secrets', async () => {
    for (const path of adminOnly) await assertSucceeds(getDoc(doc(as(ADMIN), path)));
    for (const path of functionsOnly) await assertFails(getDoc(doc(as(ADMIN), path)));
  });

  it('admins only read their own settings', async () => {
    await assertFails(getDoc(doc(as(SUPER), 'adminSettings/admin1')));
  });

  it('identity fields cannot be written into learner-readable docs', async () => {
    await assertFails(updateDoc(doc(as(ADMIN), 'playlists/pub'), { ownerUid: 'admin1' }));
    await assertFails(setDoc(doc(as(ADMIN), 'playlists/pub/verses/v9'), { nodeId: 'n1', name: 'V', order: 9, createdBy: 'admin1' }));
    await assertFails(setDoc(doc(as(ADMIN), 'playlists/pub/nodes/n9'), { parentId: null, name: 'N', order: 9, authorUid: 'admin1' }));
    await assertFails(setDoc(doc(as(ADMIN), 'playlists/pub/verses/v9'), { nodeId: 'n1', name: 'V', order: 9, driveFileId: 'drv' }));
  });
});

describe('roles are server-enforced', () => {
  it('learners cannot self-promote or write trusted state', async () => {
    await assertFails(setDoc(doc(as(OTHER), 'adminUsers/learner2'), { role: 'ADMIN', status: 'active' }));
    await assertFails(setDoc(doc(as(OTHER), 'users/learner2'), { displayName: 'Ravi', role: 'ADMIN' }));
    await assertFails(setDoc(doc(as(LEARNER), 'accessGrants/learner1_pub'), { uid: 'learner1', pid: 'pub' }));
    await assertFails(setDoc(doc(as(LEARNER), 'paymentRequests/x'), { uid: 'learner1', pid: 'paid', status: 'APPROVED' }));
    await assertFails(setDoc(doc(as(LEARNER), 'submissions/x'), { uid: 'learner1', status: 'APPROVED' }));
    await assertFails(updateDoc(doc(as(LEARNER), 'submissions/s1'), { status: 'APPROVED' }));
    await assertFails(updateDoc(doc(as(LEARNER), 'users/learner1/progress/pub'), { approvedCount: 99 }));
    await assertFails(setDoc(doc(as(LEARNER), 'users/learner1/notifications/x'), { message: 'fake', read: false }));
  });

  it('a forged or stale admin claim without an active admin record is rejected', async () => {
    for (const u of [FORGED, DEACTIVATED]) {
      await assertFails(getDoc(doc(as(u), 'adminPlaylists/pub')));
      await assertFails(getDoc(doc(as(u), 'playlists/draft')));
      await assertFails(updateDoc(doc(as(u), 'playlists/pub'), { title: 'x' }));
    }
  });

  it('admins create playlists owned by themselves only', async () => {
    const db = as(ADMIN);
    await assertSucceeds(setDoc(doc(db, 'playlists/new'), { title: 'New', access: 'free', published: false, order: 9 }));
    await assertSucceeds(setDoc(doc(db, 'adminPlaylists/new'), { ownerUid: 'admin1', createdBy: 'admin1' }));
    await assertFails(setDoc(doc(db, 'adminPlaylists/new2'), { ownerUid: 'super1', createdBy: 'admin1' }));
    await assertFails(updateDoc(doc(db, 'adminPlaylists/pub'), { storageFolderId: 'elsewhere' }));
  });

  it('admins cannot set media pointers directly (functions only)', async () => {
    await assertFails(updateDoc(doc(as(ADMIN), 'playlists/pub/verses/v1'), { audioMediaId: 'other' }));
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'playlists/pub/verses/v1'), { name: 'Verse One' }));
    await assertFails(setDoc(doc(as(ADMIN), 'playlists/pub/verses/v1/media/m2'), { kind: 'audio' }));
  });

  it('admins manage payment info and can delete it', async () => {
    await assertSucceeds(setDoc(doc(as(ADMIN), 'playlists/paid/payment/info'), { upiId: 'org@upi', payeeName: 'Org' }));
    await assertFails(setDoc(doc(as(ADMIN), 'playlists/paid/payment/info'), { upiId: 'org@upi', payeeName: 'Org', ownerUid: 'admin1' }));
    await assertSucceeds(deleteDoc(doc(as(ADMIN), 'playlists/paid/payment/info')));
  });
});

describe('learner-scoped data', () => {
  it('learners read only their own submissions, replies, grants and payments', async () => {
    const db = as(LEARNER);
    await assertSucceeds(getDoc(doc(db, 'submissions/s1')));
    await assertFails(getDoc(doc(db, 'submissions/s2')));
    await assertSucceeds(getDoc(doc(db, 'submissions/s1/replies/r1')));
    await assertFails(getDoc(doc(db, 'submissions/s2/replies/r1')));
    await assertSucceeds(getDocs(query(collection(db, 'submissions'), where('uid', '==', 'learner1'))));
    await assertFails(getDocs(collection(db, 'submissions')));
    await assertSucceeds(getDoc(doc(db, 'accessGrants/learner1_paid')));
    await assertFails(getDoc(doc(db, 'accessGrants/learner2_paid')));
    await assertSucceeds(getDocs(query(collection(db, 'paymentRequests'), where('uid', '==', 'learner1'))));
    await assertFails(getDoc(doc(db, 'paymentRequests/r2')));
  });

  it('learners read their own progress, stats and notifications', async () => {
    const db = as(LEARNER);
    await assertSucceeds(getDoc(doc(db, 'users/learner1/progress/pub')));
    await assertSucceeds(getDoc(doc(db, 'users/learner1/progress/pub/verseStatus/v1')));
    await assertSucceeds(getDoc(doc(db, 'users/learner1/meta/stats')));
    await assertFails(getDoc(doc(as(OTHER), 'users/learner1/progress/pub')));
    await assertFails(getDoc(doc(as(OTHER), 'users/learner1')));
    await assertSucceeds(updateDoc(doc(db, 'users/learner1/notifications/n1'), { read: true }));
    await assertFails(updateDoc(doc(db, 'users/learner1/notifications/n1'), { message: 'changed' }));
    await assertSucceeds(updateDoc(doc(db, 'users/learner1'), { displayName: 'Asha D' }));
    await assertFails(updateDoc(doc(db, 'users/learner1'), { email: 'other@example.com' }));
  });

  it('admins can see learners and their submissions', async () => {
    await assertSucceeds(getDoc(doc(as(ADMIN), 'users/learner1')));
    await assertSucceeds(getDocs(collection(as(ADMIN), 'submissions')));
    await assertSucceeds(getDoc(doc(as(ADMIN), 'submissions/s2/replies/r1')));
    await assertFails(updateDoc(doc(as(ADMIN), 'submissions/s1'), { status: 'APPROVED' })); // only via review_submission
  });
});
