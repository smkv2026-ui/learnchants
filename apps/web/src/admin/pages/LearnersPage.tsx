import { useState } from 'react';
import { Link } from 'react-router-dom';
import { pct } from '@/lib/progress';
import { timeAgo } from '@/lib/format';
import { EmptyState, Icon, ListSkeleton, ProgressRing, TextField } from '@/components/ui';
import { AdminHeader } from '../components/AdminLayout';
import { useLearnerRows } from '../hooks';


export default function LearnersPage() {
  const { rows, loading } = useLearnerRows();
  const [q, setQ] = useState('');
  const filtered = rows.filter((r) => `${r.displayName} ${r.email}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <AdminHeader title="Learners" subtitle={`${rows.length} learners`} />
      <TextField className="mb-5 max-w-md" label="Search" placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} />
      {loading ? (
        <ListSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState title="No learners found" />
      ) : (
        <>
        <ul className="space-y-2.5 md:hidden">
          {filtered.map((r) => (
            <li key={r.id}>
              <Link to={`/admin/learners/${r.id}`} className="glass flex items-center gap-3 rounded-2xl p-3.5 transition active:scale-[.99]">
                <ProgressRing value={pct(r.stats.approved, r.stats.total)} size={48} stroke={4} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.displayName ?? 'Learner'}</p>
                  <p className="truncate text-xs text-muted">{r.email}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    <span className="num font-semibold text-ink">{r.stats.approved}/{r.stats.total}</span> approved · {r.stats.playlists} playlists · {r.stats.last ? timeAgo(r.stats.last) : `joined ${timeAgo(r.createdAt)}`}
                  </p>
                </div>
                <Icon name="chevron-right" className="shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
        <div className="glass hidden overflow-x-auto rounded-3xl md:block">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b hairline text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Learner</th>
                <th className="px-4 py-3 font-medium">Progress</th>
                <th className="px-4 py-3 font-medium">Approved</th>
                <th className="px-4 py-3 font-medium">Playlists</th>
                <th className="px-4 py-3 font-medium">Last active</th>
                <th className="px-4 py-3"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b hairline last:border-0 hover:bg-ink/[.03]">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{r.displayName ?? 'Learner'}</p>
                    <p className="text-xs text-muted">{r.email}</p>
                  </td>
                  <td className="px-4 py-3"><ProgressRing value={pct(r.stats.approved, r.stats.total)} size={40} stroke={4} /></td>
                  <td className="px-4 py-3 tabular-nums">{r.stats.approved} / {r.stats.total}</td>
                  <td className="px-4 py-3 tabular-nums">{r.stats.playlists}</td>
                  <td className="px-4 py-3 text-muted">{r.stats.last ? timeAgo(r.stats.last) : `joined ${timeAgo(r.createdAt)}`}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/admin/learners/${r.id}`} className="inline-flex items-center gap-1 font-medium text-primary">
                      Details <Icon name="chevron-right" size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </>
  );
}
