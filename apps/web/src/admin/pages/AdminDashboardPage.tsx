import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { collection, orderBy, query } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { db } from '@/lib/firebase';
import { pct } from '@/lib/progress';
import { timeAgo } from '@/lib/format';
import type { Playlist } from '@/lib/types';
import { useCollection } from '@/hooks/useFirestore';
import { Card, Icon, ListSkeleton, ProgressBar, ProgressRing, type IconName } from '@/components/ui';
import { AdminHeader } from '../components/AdminLayout';
import { useLearnerRows, usePendingCounts } from '../hooks';

function Stat({ icon, label, value, to, tone }: { icon: IconName; label: string; value: number; to: string; tone: string }) {
  return (
    <Link to={to}>
      <Card className="flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-glow">
        <span className={`grid h-12 w-12 place-items-center rounded-2xl ${tone}`}><Icon name={icon} size={22} /></span>
        <div>
          <p className="font-display text-4xl font-bold tabular-nums">{value}</p>
          <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
        </div>
      </Card>
    </Link>
  );
}

export default function AdminDashboardPage() {
  const counts = usePendingCounts();
  const { rows, loading, progress } = useLearnerRows();
  const playlists = useCollection<Playlist>(query(collection(db, 'playlists'), orderBy('order')), 'dash-playlists');
  const popular = useMemo(() => {
    const by = new Map<string, { learners: number; approved: number; total: number }>();
    progress.forEach((p) => {
      const r = by.get(p.pid) ?? { learners: 0, approved: 0, total: 0 };
      r.learners += 1;
      r.approved += p.approvedCount || 0;
      r.total += p.totalCount || 0;
      by.set(p.pid, r);
    });
    return playlists.data
      .map((p) => ({ ...p, stats: by.get(p.id) ?? { learners: 0, approved: 0, total: 0 } }))
      .sort((a, b) => b.stats.learners - a.stats.learners);
  }, [progress, playlists.data]);
  const maxLearners = Math.max(1, ...popular.map((p) => p.stats.learners));
  const top = [...rows].sort((a, b) => (b.stats.last?.toMillis?.() ?? 0) - (a.stats.last?.toMillis?.() ?? 0)).slice(0, 10);

  return (
    <>
      <AdminHeader title="Dashboard" subtitle="An overview of your learners and what needs your attention." />
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon="users" label="Learners" value={rows.length} to="/admin/learners" tone="bg-indigo-400/15 text-indigo-400" />
        <Stat icon="inbox" label="Pending reviews" value={counts.reviews} to="/admin/reviews" tone="bg-primary/15 text-primary" />
        <Stat icon="rupee" label="Pending payments" value={counts.payments} to="/admin/payments" tone="bg-accent/15 text-accent" />
        <Stat icon="list" label="Playlists" value={playlists.data.length} to="/admin/playlists" tone="bg-success/15 text-success" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Learner progress</h2>
            <Link to="/admin/learners" className="text-sm text-primary">View all</Link>
          </div>
          {loading ? (
            <ListSkeleton rows={3} />
          ) : top.length === 0 ? (
            <p className="text-sm text-muted">No learners yet.</p>
          ) : (
            <ul className="divide-y divide-ink/10">
              {top.map((r, i) => (
                <motion.li key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                  <Link to={`/admin/learners/${r.id}`} className="flex items-center gap-3 py-3 hover:text-primary">
                    <ProgressRing value={pct(r.stats.approved, r.stats.total)} size={42} stroke={4} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.displayName ?? 'Learner'}</p>
                      <p className="text-xs text-muted">{r.stats.approved}/{r.stats.total} verses · {r.stats.playlists} playlists</p>
                    </div>
                    <span className="text-xs text-muted">{r.stats.last ? timeAgo(r.stats.last) : '—'}</span>
                  </Link>
                </motion.li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 text-2xl font-semibold">Popular playlists</h2>
          <ul className="space-y-4">
            {popular.map((p) => (
              <li key={p.id}>
                <div className="mb-1 flex justify-between text-sm">
                  <Link to={`/admin/playlists/${p.id}`} className="font-medium hover:text-primary">{p.title}</Link>
                  <span className="text-muted">{p.stats.learners} learners · {pct(p.stats.approved, p.stats.total)}% avg</span>
                </div>
                <ProgressBar value={(p.stats.learners / maxLearners) * 100} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
