import { api } from './api';
import { useAuth } from '@/stores/auth';

/** Ensure the default USER role claim and profile doc exist after sign-in. */
export async function completeSignIn(displayName?: string): Promise<void> {
  try {
    const res = await api.initProfile(displayName ? { displayName } : {});
    if (res.refreshToken) await useAuth.getState().refreshClaims();
  } catch {
    /* offline or functions unavailable: role defaults to USER client-side */
  }
}
