import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, limit, orderBy, query, where, type QueryConstraint } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { timeAgo } from '@/lib/format';
import type { Playlist, Submission, SubmissionStatus } from '@/lib/types';
import { useCollection } from '@/hooks/useFirestore';
import { EmptyState, Icon, ListSkeleton, StatusChip, Tabs, TextField } from '@/components/ui';
import { AdminHeader } from '../components/AdminLayout';

export default function ReviewQueuePage() {
  const [status, setStatus] = useState<SubmissionStatus | 'ALL'>('SUBMITTED');
  const [pid, setPid] = useState('');
  const [learner, setLearner] = useState('');
  const playlists = useCollection<Playlist>(query(collection(db, 'playlists'), orderBy('order')), 'admin-pl-filter');
  const constraints: QueryConstraint[] = [];
  if (pid) constraints.push(where('pid', '==', pid));
  if (status !== 'ALL') constraints.push(where('status', '==', status));
  constraints.push(orderBy('createdAt', 'desc'), limit(200));
  const subs = useCollection<Submission>(query(collection(db, 'submissions'), ...constraints), `queue-${status}-${pid}`);
  const filtered = useMemo(() => {
    const q = learner.trim().toLowerCase();
    return q ? subs.data.filter((s) => (s.userName ?? '').toLowerCase().includes(q)) : subs.data;
  }, [subs.data, learner]);

  return (
    <>
      <AdminHeader title="Review queue" subtitle="Listen, reply with corrections, and approve verses." />
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end">
        <Tabs
          items={[
            { id: 'SUBMITTED', label: 'Waiting' },
            { id: 'NEEDS_WORK', label: 'Needs work' },
            { id: 'APPROVED', label: 'Approved' },
            { id: 'ALL', label: 'All' },
          ]}
          value={status}
          onChange={setStatus}
        />
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <div className="sm:w-64">
            <label className="label" htmlFor="pl-filter">Playlist</label>
            <select id="pl-filter" className="input" value={pid} onChange={(e) => setPid(e.target.value)}>
              <option value="">All playlists</option>
              {playlists.data.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
          <TextField className="flex-1" label="Learner" placeholder="Search by name" value={learner} onChange={(e) => setLearner(e.target.value)} />
        </div>
      </div>
      {subs.loading ? (
        <ListSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState art="diya" title="All caught up" message="No submissions match these filters." />
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((s) => (
            <li key={s.id}>
              <Link to={`/admin/reviews/${s.id}`} className="glass flex items-center gap-4 rounded-2xl p-4 transition hover:bg-ink/5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/15 font-semibold text-primary">
                  {(s.userName ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{s.userName ?? 'Learner'} · {s.verseName}</p>
                  <p className="truncate text-xs text-muted">{s.playlistTitle} · {timeAgo(s.createdAt)} · {s.kind}</p>
                </div>
                <StatusChip status={s.status} />
                <Icon name="chevron-right" className="text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
