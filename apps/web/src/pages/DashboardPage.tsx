import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, limit, orderBy, query, where } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { db } from '@/lib/firebase';
import { computeStreak, nodePct, pct, playlistPct } from '@/lib/progress';
import { byOrder } from '@/lib/tree';
import { timeAgo } from '@/lib/format';
import type { Progress, Submission, WithId } from '@/lib/types';
import { useAuth } from '@/stores/auth';
import { useCollection, useDoc } from '@/hooks/useFirestore';
import { useMyProgress, useNodes } from '@/hooks/useLearner';
import { Badge, Button, Card, EmptyState, Icon, ListSkeleton, ProgressRing, StatTile, StatusChip } from '@/components/ui';
import { Page } from '@/components/layout/Page';


function PlaylistProgress({ progress, index }: { progress: WithId<Progress>; index: number }) {
  const nodes = useNodes(progress.pid);
  const top = nodes.data.filter((n) => !n.parentId).sort(byOrder);
  const value = playlistPct(progress);
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}>
      <Card className="p-4 sm:p-5">
        <div className="flex items-center gap-4">
          <ProgressRing value={value} size={72} stroke={7} />
          <div className="min-w-0 flex-1">
            <Link to={`/p/${progress.pid}`} className="block truncate text-2xl font-semibold hover:text-primary">{progress.title ?? 'Playlist'}</Link>
            <p className="text-sm text-muted">{progress.approvedCount} / {progress.totalCount} verses approved</p>
            {value === 100 && <Badge tone="gold" className="mt-1"><Icon name="award" size={12} /> Completed</Badge>}
          </div>
        </div>
        {top.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:gap-3 lg:grid-cols-3">
            {top.map((n) => (
              <Link key={n.id} to={`/p/${progress.pid}/n/${n.id}`} className="flex items-center gap-3 rounded-2xl bg-ink/[.04] p-3 transition hover:bg-ink/[.08]">
                <ProgressRing value={nodePct(progress, n)} size={44} stroke={4} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{n.name}</span>
                  <span className="text-xs text-muted">{progress.nodeApproved?.[n.id] ?? 0}/{n.verseCount ?? 0}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

export default function DashboardPage() {
  const uid = useAuth((s) => s.user?.uid);
  const progress = useMyProgress();
  const stats = useDoc<{ activityDays?: string[] }>(uid ? doc(db, 'users', uid, 'meta', 'stats') : null);
  const recent = useCollection<Submission>(
    uid ? query(collection(db, 'submissions'), where('uid', '==', uid), orderBy('createdAt', 'desc'), limit(8)) : null,
    `recent-${uid}`,
  );
  const totals = useMemo(
    () => progress.data.reduce((a, p) => ({ approved: a.approved + (p.approvedCount || 0), total: a.total + (p.totalCount || 0) }), { approved: 0, total: 0 }),
    [progress.data],
  );
  const pending = recent.data.filter((s) => s.status === 'SUBMITTED').length;
  const streak = computeStreak(stats.data?.activityDays);

  return (
    <Page title="Your progress" wide>
      <h1 className="mb-5 text-4xl font-semibold sm:mb-6 sm:text-5xl">Your progress</h1>
      {progress.loading ? (
        <ListSkeleton />
      ) : progress.data.length === 0 ? (
        <EmptyState title="Your journey begins" message="Open a chant, listen three times and record yourself. Your progress will bloom here." action={<Link to="/"><Button icon="sparkles">Find a chant</Button></Link>} />
      ) : (
        <>
          <div className="mb-8 grid gap-4 md:grid-cols-[auto_1fr]">
            <Card className="mandala-bg flex items-center justify-center gap-6 p-5 sm:p-6 md:flex-col">
              <ProgressRing value={pct(totals.approved, totals.total)} size={140} stroke={11} label="Overall progress">
                <span>
                  <span className="text-gold-gradient num block text-4xl font-bold">{pct(totals.approved, totals.total)}%</span>
                  <span className="text-xs uppercase tracking-widest text-muted">overall</span>
                </span>
              </ProgressRing>
            </Card>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatTile icon="check" label="Verses approved" value={totals.approved} tone="bg-success/15 text-success" />
              <StatTile icon="flame" label="Day streak" value={streak} />
              <StatTile icon="clock" label="Awaiting feedback" value={pending} tone="bg-indigo-400/15 text-indigo-400" />
              <StatTile icon="book" label="Playlists started" value={progress.data.length} tone="bg-accent/15 text-accent" />
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
            <section className="space-y-4" aria-label="Playlists">
              {progress.data.map((p, i) => (
                <PlaylistProgress key={p.id} progress={p} index={i} />
              ))}
            </section>
            <Card className="h-fit p-5">
              <h2 className="mb-3 text-xl font-semibold">Recent activity</h2>
              {recent.data.length === 0 ? (
                <p className="text-sm text-muted">No recordings yet.</p>
              ) : (
                <ul className="space-y-2">
                  {recent.data.map((s) => (
                    <li key={s.id}>
                      <Link to={`/p/${s.pid}/v/${s.vid}`} className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-ink/5">
                        <Icon name={s.kind === 'video' ? 'video' : 'mic'} className="text-muted" size={18} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{s.verseName}</span>
                          <span className="text-xs text-muted">{s.playlistTitle} · {timeAgo(s.createdAt)}</span>
                        </span>
                        <StatusChip status={s.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </Page>
  );
}
