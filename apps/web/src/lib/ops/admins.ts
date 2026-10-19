import { doc, runTransaction, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/stores/auth';
import { auditInBatch, me, randomToken } from './common';

const INVITE_DAYS = 7;

/** Single-use, expiring invite; the token is the (unguessable, unreadable) doc id. */
export async function createAdminInvite(email?: string): Promise<{ token: string; link: string; expiresAt: string }> {
  const u = me();
  const token = randomToken();
  const expires = new Date(Date.now() + (INVITE_DAYS * 24 - 1) * 3600 * 1000);
  const batch = writeBatch(db);
  batch.set(doc(db, 'adminInvites', token), {
    email: email ? email.trim().toLowerCase() : null,
    createdBy: u.uid,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(expires),
  });
  auditInBatch(batch, 'admin.invite.create', { email: email ?? null });
  await batch.commit();
  return { token, link: `${location.origin}/admin/invite/${token}`, expiresAt: expires.toISOString() };
}

/** Accept: create my admin record and consume the invite atomically (rules validate it). */
export async function acceptAdminInvite(token: string): Promise<void> {
  const u = me();
  try {
    // Transaction (not a batch) so nothing is applied locally unless the rules accept it.
    await runTransaction(db, async (tx) => {
      tx.set(doc(db, 'adminUsers', u.uid), {
        email: u.email,
        displayName: u.displayName || (u.email ?? 'Admin').split('@')[0],
        role: 'ADMIN',
        status: 'active',
        createdAt: serverTimestamp(),
        inviteId: token,
      });
      tx.delete(doc(db, 'adminInvites', token));
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'permission-denied') {
      throw new Error('This invite is invalid, expired, already used, or for a different email address.');
    }
    throw err;
  }
  await useAuth.getState().refreshClaims();
}

export async function setAdminActive(uid: string, active: boolean): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'adminUsers', uid), { status: active ? 'active' : 'deactivated', updatedAt: serverTimestamp() });
  auditInBatch(batch, active ? 'admin.activate' : 'admin.deactivate', { uid });
  await batch.commit();
}

export async function removeAdmin(uid: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'adminUsers', uid));
  auditInBatch(batch, 'admin.remove', { uid });
  await batch.commit();
}

