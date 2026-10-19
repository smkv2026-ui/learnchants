import { collection, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/stores/auth';
import { useCollection } from './useFirestore';

export function useUnreadCount(): number {
  const user = useAuth((s) => s.user);
  const q = user ? query(collection(db, 'users', user.uid, 'notifications'), where('read', '==', false)) : null;
  return useCollection(q, `unread-${user?.uid}`).data.length;
}
