import { collection, doc, serverTimestamp, type WriteBatch } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

export function me() {
  const u = auth.currentUser;
  if (!u) throw new Error('Please sign in first.');
  return u;
}

/** Admin action trail (rules require actorUid == the signed-in admin). */
export function auditInBatch(batch: WriteBatch, action: string, target: Record<string, unknown> = {}): void {
  const u = me();
  batch.set(doc(collection(db, 'auditLogs')), { actorUid: u.uid, actorEmail: u.email, action, target, createdAt: serverTimestamp() });
}

export function notifyInBatch(batch: WriteBatch, uid: string, type: string, message: string, link: string | null = null): void {
  batch.set(doc(collection(db, 'users', uid, 'notifications')), { type, message, link, read: false, createdAt: serverTimestamp() });
}

export function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** 32 random bytes, base64url: unguessable ids for invite tokens. */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function auditInBatchless(action: string, target: Record<string, unknown> = {}): Promise<void> {
  const { writeBatch } = await import('firebase/firestore');
  const batch = writeBatch(db);
  auditInBatch(batch, action, target);
  await batch.commit();
}
