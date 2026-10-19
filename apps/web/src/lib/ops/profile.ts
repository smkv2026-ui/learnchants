import { doc, getDoc, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/stores/auth';
import { me } from './common';

/** Make sure ``users/{uid}`` exists after sign-in / sign-up. */
export async function ensureProfile(displayName?: string): Promise<void> {
  const u = me();
  const ref = doc(db, 'users', u.uid);
  const snap = await getDoc(ref).catch(() => null);
  const name = (displayName || u.displayName || (u.email ?? 'Learner').split('@')[0]).slice(0, 80);
  if (!snap?.exists()) await setDoc(ref, { displayName: name, email: u.email, createdAt: serverTimestamp() });
  else if (displayName) await setDoc(ref, { displayName: name }, { merge: true });
}

/**
 * First-run owner bootstrap: the owner email baked into firestore.rules becomes
 * Super Admin on a verified sign-in. Rules reject everyone else, so this is a
 * harmless no-op for other accounts.
 */
export async function tryBootstrapOwner(): Promise<boolean> {
  const u = me();
  if (!u.email || !u.emailVerified) return false;
  const ref = doc(db, 'adminUsers', u.uid);
  if ((await getDoc(ref).catch(() => null))?.exists()) return false;
  try {
    // A transaction is only applied once the server accepts it, so a rejected
    // attempt never shows up as a (fake) local admin record.
    await runTransaction(db, async (tx) => {
      tx.set(ref, {
        email: u.email,
        displayName: u.displayName || u.email!.split('@')[0],
        role: 'SUPER_ADMIN',
        status: 'active',
        createdAt: serverTimestamp(),
        inviteId: null,
      });
    });
    await useAuth.getState().refreshClaims();
    return true;
  } catch {
    return false;
  }
}
