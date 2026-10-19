import { Link, useParams } from 'react-router-dom';
import { collection, doc, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { playlistPct } from '@/lib/progress';
import { timeAgo } from '@/lib/format';
import type { Playlist, Progress, Submission } from '@/lib/types';
import { useCollection, useDoc } from '@/hooks/useFirestore';
import { Breadcrumbs, Card, EmptyState, Icon, ListSkeleton, ProgressRing, StatusChip } from '@/components/ui';
import { AdminHeader } from '../components/AdminLayout';

export default function LearnerDetailPage() {
  const { uid } = useParams<{ uid: string }>();
  const user = useDoc<{ displayName?: string; email?: string }>(uid ? doc(db, 'users', uid) : null);
  const progress = useCollection<Progress>(uid ? collection(db, 'users', uid, 'progress') : null, `lp-${uid}`);
  const subs = useCollection<Submission>(uid ? query(collection(db, 'submissions'), where('uid', '==', uid), orderBy('createdAt', 'desc')) : null, `ls-${uid}`);
  const playlists = useCollection<Playlist>(collection(db, 'playlists'), 'ld-playlists');
  const verseCount = new Map(playlists.data.map((p) => [p.id, p.verseCount ?? 0]));
  const grants = useCollection<{ pid: string }>(uid ? query(collection(db, 'accessGrants'), where('uid', '==', uid)) : null, `lg-${uid}`);

  return (
    <>
      <Breadcrumbs items={[{ label: 'Learners', to: '/admin/learners' }, { label: user.data?.displayName ?? 'Learner' }]} />
      <AdminHeader title={user.data?.displayName ?? 'Learner'} subtitle={user.data?.email} />
      <div className="grid gap-6 xl:grid-cols-[1fr_2fr]">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Progress</h2>
          {progress.loading ? (
            <ListSkeleton rows={2} />
          ) : progress.data.length === 0 ? (
            <p className="text-sm text-muted">Hasn't started a playlist yet.</p>
          ) : (
            progress.data.map((p) => (
              <Card key={p.id} className="flex items-center gap-4 p-4">
                <ProgressRing value={playlistPct(p, verseCount.get(p.pid))} size={56} />
                <div>
                  <p className="font-semibold">{p.title}</p>
                  <p className="text-xs text-muted">{p.approvedCount} / {verseCount.get(p.pid) ?? 0} approved · updated {timeAgo(p.updatedAt)}</p>
                </div>
              </Card>
            ))
          )}
          {grants.data.length > 0 && (
            <Card className="p-4 text-sm">
              <p className="mb-1 font-semibold">Paid access</p>
              {grants.data.map((g) => (
                <Link key={g.id} to={`/admin/playlists/${g.pid}?tab=access`} className="flex items-center gap-1 text-primary hover:underline">
                  <Icon name="unlock" size={14} /> {g.pid}
                </Link>
              ))}
            </Card>
          )}
        </div>
        <div>
          <h2 className="mb-4 text-xl font-semibold">All submissions ({subs.data.length})</h2>
          {subs.loading ? (
            <ListSkeleton />
          ) : subs.data.length === 0 ? (
            <EmptyState title="No submissions yet" />
          ) : (
            <ul className="space-y-2">
              {subs.data.map((s) => (
                <li key={s.id}>
                  <Link to={`/admin/reviews/${s.id}`} className="glass flex items-center gap-3 rounded-2xl p-3 hover:bg-ink/5">
                    <Icon name={s.kind === 'video' ? 'video' : 'mic'} className="text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.verseName}</p>
                      <p className="text-xs text-muted">{s.playlistTitle} · {timeAgo(s.createdAt)} · {s.replyCount ?? 0} replies</p>
                    </div>
                    <StatusChip status={s.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
