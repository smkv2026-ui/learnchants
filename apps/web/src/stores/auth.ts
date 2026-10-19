import { create } from 'zustand';
import { onIdTokenChanged, signOut, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import type { Role } from '@/lib/types';

interface AuthState {
  user: User | null;
  role: Role | null;
  ready: boolean;
  refreshClaims: () => Promise<Role>;
  logout: () => Promise<void>;
}

async function roleOf(user: User, force = false): Promise<Role> {
  const res = await user.getIdTokenResult(force);
  const role = res.claims.role as Role | undefined;
  return role === 'ADMIN' || role === 'SUPER_ADMIN' ? role : 'USER';
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  role: null,
  ready: false,
  refreshClaims: async () => {
    const user = get().user ?? auth.currentUser;
    if (!user) return 'USER';
    const role = await roleOf(user, true);
    set({ role, user });
    return role;
  },
  logout: async () => {
    await signOut(auth);
    set({ user: null, role: null });
  },
}));

onIdTokenChanged(auth, async (user) => {
  if (!user) {
    useAuth.setState({ user: null, role: null, ready: true });
    return;
  }
  try {
    useAuth.setState({ user, role: await roleOf(user), ready: true });
  } catch {
    useAuth.setState({ user, role: 'USER', ready: true });
  }
});

export const isAdminRole = (role: Role | null | undefined) => role === 'ADMIN' || role === 'SUPER_ADMIN';
