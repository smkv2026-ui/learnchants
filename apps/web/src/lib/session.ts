import { ensureProfile } from './ops/profile';

/** Ensure the learner profile doc exists after sign-in (best effort when offline). */
export async function completeSignIn(displayName?: string): Promise<void> {
  try {
    await ensureProfile(displayName);
  } catch {
    /* offline: retried on next sign-in */
  }
}
