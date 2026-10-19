import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, deleteDoc, doc, limit, orderBy, query, updateDoc, writeBatch } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { db } from '@/lib/firebase';
import { timeAgo } from '@/lib/format';
import { celebrate } from '@/lib/celebrate';
import type { AppNotification } from '@/lib/types';
import { useAuth } from '@/stores/auth';
import { useCollection } from '@/hooks/useFirestore';
import { Button, EmptyState, Icon, IconButton, ListSkeleton, cn, type IconName } from '@/components/ui';
import { Page } from '@/components/layout/Page';

const ICONS: Record<string, IconName> = {
  approved: 'award',
  needs_work: 'refresh',
  section_complete: 'sparkles',
  playlist_complete: 'award',
  payment_approved: 'unlock',
  payment_rejected: 'alert',
  access_revoked: 'lock',
};

export default function NotificationsPage() {
  const uid = useAuth((s) => s.user?.uid);
  const navigate = useNavigate();
  const items = useCollection<AppNotification>(
    uid ? query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc'), limit(100)) : null,
    `notifs-${uid}`,
  );
  const celebrated = useRef(false);
  const unread = items.data.filter((n) => !n.read);

  useEffect(() => {
    if (celebrated.current || !unread.length) return;
    celebrated.current = true;
    const big = unread.some((n) => n.type === 'playlist_complete' || n.type === 'section_complete');
    if (big || unread.some((n) => n.type === 'approved' || n.type === 'payment_approved')) celebrate(big);
  }, [unread]);

  const markAll = async () => {
    if (!uid) return;
    const batch = writeBatch(db);
    unread.forEach((n) => batch.update(doc(db, 'users', uid, 'notifications', n.id), { read: true }));
    await batch.commit();
  };

  return (
    <Page title="Inbox">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-4xl font-semibold">Inbox</h1>
        {unread.length > 0 && (
          <Button variant="ghost" size="sm" icon="check" onClick={() => void markAll()}>
            Mark all read
          </Button>
        )}
      </div>
      {items.loading ? (
        <ListSkeleton />
      ) : items.data.length === 0 ? (
        <EmptyState art="bell" title="All quiet" message="Feedback from your teacher and payment updates will appear here." />
      ) : (
        <ul className="space-y-2.5">
          {items.data.map((n, i) => (
            <motion.li key={n.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
              <div className={cn('glass flex items-start gap-3 rounded-2xl p-4', !n.read && 'border-primary/40 shadow-glow')}>
                <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', n.type.includes('rejected') || n.type.includes('revoked') ? 'bg-danger/15 text-danger' : 'bg-primary/15 text-primary')}>
                  <Icon name={ICONS[n.type] ?? 'bell'} />
                </span>
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={async () => {
                    if (uid && !n.read) await updateDoc(doc(db, 'users', uid, 'notifications', n.id), { read: true });
                    if (n.link) navigate(n.link);
                  }}
                >
                  <p className={cn('text-sm', !n.read && 'font-semibold')}>{n.message}</p>
                  <p className="mt-0.5 text-xs text-muted">{timeAgo(n.createdAt)}</p>
                </button>
                <IconButton icon="trash" label="Delete notification" size="sm" onClick={() => uid && void deleteDoc(doc(db, 'users', uid, 'notifications', n.id))} />
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </Page>
  );
}
