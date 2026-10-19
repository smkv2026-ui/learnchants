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
        <div className="glass overflow-x-auto rounded-3xl">
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
      )}
    </>
  );
}
