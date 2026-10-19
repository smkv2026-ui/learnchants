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
import { Badge, Button, Card, EmptyState, Icon, ListSkeleton, ProgressRing, StatusChip, type IconName } from '@/components/ui';
import { Page } from '@/components/layout/Page';

function Stat({ icon, label, value, tone = 'text-primary' }: { icon: IconName; label: string; value: string | number; tone?: string }) {
  return (
    <Card className="flex items-center gap-4 p-4">
      <span className={`grid h-12 w-12 place-items-center rounded-2xl bg-ink/5 ${tone}`}>
        <Icon name={icon} size={22} />
      </span>
      <div>
        <p className="font-display text-3xl font-bold tabular-nums">{value}</p>
        <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      </div>
    </Card>
  );
}

function PlaylistProgress({ progress, index }: { progress: WithId<Progress>; index: number }) {
  const nodes = useNodes(progress.pid);
  const top = nodes.data.filter((n) => !n.parentId).sort(byOrder);
  const value = playlistPct(progress);
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}>
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <ProgressRing value={value} size={84} stroke={7} />
          <div className="min-w-0 flex-1">
            <Link to={`/p/${progress.pid}`} className="text-2xl font-semibold hover:text-primary">{progress.title ?? 'Playlist'}</Link>
            <p className="text-sm text-muted">{progress.approvedCount} / {progress.totalCount} verses approved</p>
            {value === 100 && <Badge tone="gold" className="mt-1"><Icon name="award" size={12} /> Completed</Badge>}
          </div>
        </div>
        {top.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {top.map((n) => (
              <Link key={n.id} to={`/p/${progress.pid}/n/${n.id}`} className="flex items-center gap-3 rounded-2xl bg-ink/[.04] p-3 transition hover:bg-ink/[.08]">
                <ProgressRing value={nodePct(progress, n)} size={44} stroke={4} />
                <span className="min-w-0">
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
      <h1 className="mb-6 text-4xl font-semibold sm:text-5xl">Your progress</h1>
      {progress.loading ? (
        <ListSkeleton />
      ) : progress.data.length === 0 ? (
        <EmptyState title="Your journey begins" message="Open a chant, listen three times and record yourself. Your progress will bloom here." action={<Link to="/"><Button icon="sparkles">Find a chant</Button></Link>} />
      ) : (
        <>
          <div className="mb-8 grid gap-4 md:grid-cols-[auto_1fr]">
            <Card className="mandala-bg flex flex-col items-center justify-center p-6">
              <ProgressRing value={pct(totals.approved, totals.total)} size={150} stroke={11} label="Overall progress">
                <span>
                  <span className="text-gold-gradient block font-display text-4xl font-bold">{pct(totals.approved, totals.total)}%</span>
                  <span className="text-xs uppercase tracking-widest text-muted">overall</span>
                </span>
              </ProgressRing>
            </Card>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat icon="check" label="Verses approved" value={totals.approved} tone="text-success" />
              <Stat icon="flame" label="Day streak" value={streak} />
              <Stat icon="clock" label="Awaiting feedback" value={pending} tone="text-indigo-400" />
              <Stat icon="book" label="Playlists started" value={progress.data.length} tone="text-accent" />
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
