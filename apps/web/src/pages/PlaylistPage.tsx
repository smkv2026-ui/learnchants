import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { formatInr } from '@/lib/upi';
import { nodePct, playlistPct } from '@/lib/progress';
import { orderedVerses, unlockedVerses } from '@/lib/sequence';
import { byOrder, pathTo } from '@/lib/tree';
import { useAuth } from '@/stores/auth';
import {
  useHasAccess,
  useMaterials,
  useMyPaymentRequests,
  useNodes,
  usePlaylist,
  usePlaylistProgress,
  useVerseStatuses,
  useVerses,
} from '@/hooks/useLearner';
import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  EmptyState,
  Icon,
  ListSkeleton,
  ProgressRing,
  Skeleton,
  StatusChip,
  type VerseState,
} from '@/components/ui';
import { Page } from '@/components/layout/Page';
import { CoverArt } from '@/components/learner/PlaylistCard';
import { MaterialsList } from '@/components/learner/MaterialsList';

export default function PlaylistPage() {
  const { pid, nid } = useParams<{ pid: string; nid?: string }>();
  const user = useAuth((s) => s.user);
  const playlist = usePlaylist(pid);
  const nodes = useNodes(pid);
  const verses = useVerses(pid);
  const materials = useMaterials(pid);
  const progress = usePlaylistProgress(pid);
  const statuses = useVerseStatuses(pid);
  const { access } = useHasAccess(pid, playlist.data);
  const payments = useMyPaymentRequests(playlist.data?.access === 'paid' ? pid : undefined);

  const statusMap = useMemo(() => new Map(statuses.data.map((s) => [s.id, s.status])), [statuses.data]);
  const ordered = useMemo(() => orderedVerses(nodes.data, verses.data), [nodes.data, verses.data]);
  const unlocked = useMemo(
    () => unlockedVerses(ordered, statusMap, !!playlist.data?.sequentialUnlock),
    [ordered, statusMap, playlist.data?.sequentialUnlock],
  );

  if (playlist.loading) {
    return (
      <Page>
        <Skeleton className="mb-6 h-56 w-full rounded-4xl" />
        <ListSkeleton />
      </Page>
    );
  }
  if (!playlist.data) {
    return (
      <Page title="Not found">
        <EmptyState title="Playlist not found" message="It may have been unpublished." action={<Link to="/"><Button>Back home</Button></Link>} />
      </Page>
    );
  }

  const p = playlist.data;
  const current = nid ? nodes.data.find((n) => n.id === nid) : undefined;
  const trail = pathTo(nodes.data, nid);
  const children = nodes.data.filter((n) => (n.parentId ?? null) === (nid ?? null)).sort(byOrder);
  const levelVerses = ordered.filter((v) => nid && v.nodeId === nid);
  const levelMaterials = materials.data.filter((m) => (m.nodeId ?? null) === (nid ?? null)).sort(byOrder);
  const pending = payments.data.find((r) => r.status === 'PENDING');
  const rejected = [...payments.data].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))[0];
  const locked = p.access === 'paid' && !access;

  return (
    <Page title={current?.name ?? p.title}>
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/' },
          { label: p.title, to: `/p/${pid}` },
          ...trail.map((n) => ({ label: n.name, to: `/p/${pid}/n/${n.id}` })),
        ]}
      />

      {!nid ? (
        <Card className="mb-8 overflow-hidden">
          <div className="grid md:grid-cols-[2fr_3fr]">
            <div className="aspect-[16/10] md:aspect-auto md:min-h-[260px]">
              <CoverArt playlist={p} />
            </div>
            <div className="p-6 sm:p-8">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {p.access === 'paid' ? <Badge tone="gold">{formatInr(p.price)}</Badge> : <Badge tone="success">Free</Badge>}
                {p.sequentialUnlock && <Badge tone="indigo"><Icon name="lock" size={12} /> Step by step</Badge>}
                <Badge>{p.verseCount ?? 0} verses</Badge>
              </div>
              <h1 className="text-4xl font-semibold sm:text-5xl">{p.title}</h1>
              {p.titleNative && <p lang="sa" className="mt-1 font-chant text-2xl text-primary">{p.titleNative}</p>}
              {p.description && <p className="mt-4 whitespace-pre-line text-muted">{p.description}</p>}
              {user && progress.data && (
                <div className="mt-6 flex items-center gap-4">
                  <ProgressRing value={playlistPct(progress.data)} size={72} />
                  <div className="text-sm">
                    <p className="font-semibold">{progress.data.approvedCount} of {progress.data.totalCount} verses approved</p>
                    <p className="text-muted">Keep going, every verse counts.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      ) : (
        <div className="mb-6 flex items-center gap-4">
          <ProgressRing value={current ? nodePct(progress.data, current) : 0} size={64} />
          <div>
            <h1 className="text-4xl font-semibold">{current?.name ?? 'Section'}</h1>
            {current?.description && <p className="text-muted">{current.description}</p>}
          </div>
        </div>
      )}

      {locked && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass mb-8 flex flex-col gap-4 rounded-3xl border-primary/40 p-5 sm:flex-row sm:items-center">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Icon name="lock" />
          </span>
          <div className="flex-1">
            {pending ? (
              <>
                <p className="font-semibold">Payment under review</p>
                <p className="text-sm text-muted">Reference {pending.reference}. You'll be notified once it is approved.</p>
              </>
            ) : (
              <>
                <p className="font-semibold">Unlock this playlist for {formatInr(p.price)}</p>
                <p className="text-sm text-muted">
                  {rejected?.status === 'REJECTED'
                    ? `Your last payment could not be verified: ${rejected.reason}. You can submit again.`
                    : 'Browse everything now; audio and video unlock after your payment is approved.'}
                </p>
              </>
            )}
          </div>
          {!pending && (
            <Link to={user ? `/p/${pid}/pay` : `/login?next=/p/${pid}/pay`}>
              <Button icon="rupee">Unlock</Button>
            </Link>
          )}
        </motion.div>
      )}

      {nodes.loading || verses.loading ? (
        <ListSkeleton />
      ) : (
        <>
          {children.length > 0 && (
            <section aria-label="Sections" className="mb-8 grid gap-3 sm:grid-cols-2">
              {children.map((n, i) => (
                <motion.div key={n.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.4) }}>
                  <Link
                    to={`/p/${pid}/n/${n.id}`}
                    className="glass group flex items-center gap-4 rounded-2xl p-4 transition hover:-translate-y-0.5 hover:shadow-glow"
                  >
                    <ProgressRing value={nodePct(progress.data, n)} size={52} stroke={5} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-semibold">{n.name}</p>
                      <p className="text-xs text-muted">{n.verseCount ?? 0} verses{n.description ? ` · ${n.description}` : ''}</p>
                    </div>
                    <Icon name="chevron-right" className="text-muted transition group-hover:translate-x-1 group-hover:text-primary" />
                  </Link>
                </motion.div>
              ))}
            </section>
          )}

          {nid && (
            <section aria-label="Verses">
              {levelVerses.length === 0 && children.length === 0 ? (
                <EmptyState title="Verses coming soon" message="Your teacher hasn't added verses here yet." art="scroll" />
              ) : (
                <ol className="space-y-2.5">
                  {levelVerses.map((v, i) => {
                    const open = unlocked.has(v.id);
                    const state: VerseState = !open ? 'LOCKED' : (statusMap.get(v.id) as VerseState) ?? 'NOT_STARTED';
                    const inner = (
                      <>
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gold-sheen num text-base font-bold text-maroon-900">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{v.name}</p>
                          {v.firstLine && <p lang="sa" className="truncate font-chant text-sm text-muted">{v.firstLine}</p>}
                        </div>
                        <StatusChip status={state} />
                      </>
                    );
                    return (
                      <motion.li key={v.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
                        {open ? (
                          <Link to={`/p/${pid}/v/${v.id}`} className="glass flex items-center gap-4 rounded-2xl p-3.5 transition hover:bg-ink/5">
                            {inner}
                          </Link>
                        ) : (
                          <div className="glass flex items-center gap-4 rounded-2xl p-3.5 opacity-60" title="Complete the previous verse to unlock">
                            {inner}
                          </div>
                        )}
                      </motion.li>
                    );
                  })}
                </ol>
              )}
            </section>
          )}
          {!nid && children.length === 0 && (
            <EmptyState title="Being prepared" message="This playlist doesn't have any sections yet." art="scroll" />
          )}
        </>
      )}

      <MaterialsList items={levelMaterials} canOpen={!locked} />
    </Page>
  );
}
