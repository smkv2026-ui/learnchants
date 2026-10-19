import { useMemo } from 'react';
import { collection, collectionGroup, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Progress, TS } from '@/lib/types';
import { useCollection } from '@/hooks/useFirestore';

export function usePendingCounts() {
  const subs = useCollection(query(collection(db, 'submissions'), where('status', '==', 'SUBMITTED')), 'pending-subs');
  const pays = useCollection(query(collection(db, 'paymentRequests'), where('status', '==', 'PENDING')), 'pending-pays');
  return { reviews: subs.data.length, payments: pays.data.length };
}

export function useLearnerRows() {
  const users = useCollection<{ displayName?: string; email?: string; createdAt?: TS }>(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(1000)), 'admin-users');
  const progress = useCollection<Progress>(collectionGroup(db, 'progress'), 'admin-progress-all');
  const admins = useCollection(collection(db, 'adminUsers'), 'admin-admins-ids');
  const rows = useMemo(() => {
    const adminIds = new Set(admins.data.map((a) => a.id));
    const byUser = new Map<string, { approved: number; total: number; playlists: number; last?: TS }>();
    for (const p of progress.data) {
      const r = byUser.get(p.uid) ?? { approved: 0, total: 0, playlists: 0 };
      r.approved += p.approvedCount || 0;
      r.total += p.totalCount || 0;
      r.playlists += 1;
      if (!r.last || (p.updatedAt?.toMillis?.() ?? 0) > (r.last?.toMillis?.() ?? 0)) r.last = p.updatedAt;
      byUser.set(p.uid, r);
    }
    return users.data
      .filter((u) => !adminIds.has(u.id))
      .map((u) => ({ ...u, stats: byUser.get(u.id) ?? { approved: 0, total: 0, playlists: 0 } }));
  }, [users.data, progress.data, admins.data]);
  return { rows, loading: users.loading || progress.loading, progress: progress.data };
}
