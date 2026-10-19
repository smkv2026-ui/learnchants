import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { storeMedia } from '@/lib/media';
import type { PaymentRequest, Playlist, WithId } from '@/lib/types';
import { auditInBatch, me, notifyInBatch } from './common';

export function normaliseReference(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

/**
 * Submit (or resubmit after a rejection) a UPI payment reference. The reference
 * is claimed in ``paymentRefs/{ref}`` in the same batch so it can't be reused
 * while pending/approved; the rules validate amount, playlist and ownership.
 */
export async function submitPaymentRequest(
  pid: string,
  playlist: Playlist,
  rawReference: string,
  screenshot?: Blob | null,
  onProgress?: (f: number) => void,
): Promise<{ duplicateFlag: boolean }> {
  const u = me();
  const reference = normaliseReference(rawReference);
  if (!/^[A-Z0-9-]{6,40}$/.test(reference)) throw new Error('Enter the UPI reference / UTR number (6-40 letters or digits).');
  const rid = `${u.uid}_${pid}`;
  const refDoc = doc(db, 'paymentRefs', reference);
  const reqDoc = doc(db, 'paymentRequests', rid);
  const [existingReq, user] = await Promise.all([getDoc(reqDoc).catch(() => null), getDoc(doc(db, 'users', u.uid))]);
  const prev = existingReq?.data() as PaymentRequest | undefined;
  if (prev && prev.status !== 'REJECTED') {
    throw new Error(prev.status === 'PENDING' ? 'You already have a payment request awaiting review.' : 'You already have access.');
  }
  let screenshotMediaId: string | null = null;
  if (screenshot) {
    screenshotMediaId = await storeMedia(screenshot, { purpose: 'payment_screenshot', pid, learnerUid: u.uid, kind: null }, { onProgress });
  }
  // A reference that exists is only claimable after it was rejected; the flag
  // tells the admin it was used before. Learners cannot read paymentRefs, so the
  // flag is decided by whether the claim overwrites an existing doc (the rules
  // check duplicateFlag == exists(ref)); try "new" first, then "re-used".
  const attempt = async (duplicateFlag: boolean) => {
    const batch = writeBatch(db);
    batch.set(refDoc, { requestId: rid, uid: u.uid, status: 'PENDING' });
    batch.set(reqDoc, {
      uid: u.uid,
      userName: user.data()?.displayName ?? u.displayName ?? null,
      pid,
      playlistTitle: playlist.title,
      amount: playlist.price,
      reference,
      screenshotMediaId,
      status: 'PENDING',
      reason: null,
      duplicateFlag,
      previousReferences: prev ? [...((prev as { previousReferences?: string[] }).previousReferences ?? []), prev.reference] : [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  };
  try {
    await attempt(false);
    return { duplicateFlag: false };
  } catch {
    try {
      await attempt(true);
      return { duplicateFlag: true };
    } catch (err) {
      if ((err as { code?: string }).code === 'permission-denied') {
        throw new Error('This payment reference has already been submitted. Check the number, or contact your teacher.');
      }
      throw err;
    }
  }
}

export async function reviewPayment(req: WithId<PaymentRequest>, decision: 'APPROVED' | 'REJECTED', reason?: string): Promise<void> {
  if (decision === 'REJECTED' && !reason?.trim()) throw new Error('A reason is required when rejecting.');
  const batch = writeBatch(db);
  batch.update(doc(db, 'paymentRequests', req.id), {
    status: decision,
    reason: decision === 'REJECTED' ? reason!.trim() : null,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'paymentRefs', req.reference), { status: decision });
  if (decision === 'APPROVED') {
    batch.set(doc(db, 'accessGrants', `${req.uid}_${req.pid}`), {
      uid: req.uid,
      pid: req.pid,
      grantedAt: serverTimestamp(),
      source: 'payment',
      requestId: req.id,
    });
    notifyInBatch(batch, req.uid, 'payment_approved', `Your payment for “${req.playlistTitle}” was approved. Enjoy learning!`, `/p/${req.pid}`);
  } else {
    notifyInBatch(batch, req.uid, 'payment_rejected', `Your payment for “${req.playlistTitle}” could not be verified: ${reason}. You can submit again.`, `/p/${req.pid}/pay`);
  }
  auditInBatch(batch, `payment.${decision.toLowerCase()}`, { requestId: req.id, uid: req.uid, pid: req.pid });
  await batch.commit();
}

export async function revokeAccess(uid: string, pid: string, playlistTitle: string, reason?: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'accessGrants', `${uid}_${pid}`));
  notifyInBatch(batch, uid, 'access_revoked', `Your access to “${playlistTitle}” has been revoked.${reason ? ` ${reason}` : ''}`, `/p/${pid}`);
  auditInBatch(batch, 'access.revoke', { uid, pid });
  await batch.commit();
}
