import { create } from 'zustand';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { Role } from '@/lib/types';

interface AuthState {
  user: User | null;
  role: Role | null;
  ready: boolean;
  refreshClaims: () => Promise<Role>;
  logout: () => Promise<void>;
}

/** Role comes from an active ``adminUsers/{uid}`` record (enforced by Firestore rules). */
function roleFrom(data: { role?: string; status?: string } | undefined): Role {
  if (!data || data.status !== 'active') return 'USER';
  return data.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : data.role === 'ADMIN' ? 'ADMIN' : 'USER';
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  role: null,
  ready: false,
  refreshClaims: async () => {
    const user = get().user ?? auth.currentUser;
    if (!user) return 'USER';
    const snap = await getDoc(doc(db, 'adminUsers', user.uid)).catch(() => null);
    const role = roleFrom(snap?.data());
    set({ role, user });
    return role;
  },
  logout: async () => {
    await signOut(auth);
    set({ user: null, role: null });
  },
}));

let unsubAdmin: Unsubscribe | null = null;

onAuthStateChanged(auth, (user) => {
  unsubAdmin?.();
  unsubAdmin = null;
  if (!user) {
    useAuth.setState({ user: null, role: null, ready: true });
    return;
  }
  useAuth.setState({ user, ready: false });
  unsubAdmin = onSnapshot(
    doc(db, 'adminUsers', user.uid),
    (snap) => useAuth.setState({ user, role: roleFrom(snap.data()), ready: true }),
    () => useAuth.setState({ user, role: 'USER', ready: true }),
  );
});

export const isAdminRole = (role: Role | null | undefined) => role === 'ADMIN' || role === 'SUPER_ADMIN';
