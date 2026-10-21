import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, orderBy, query, where } from 'firebase/firestore';
import { AnimatePresence, motion } from 'framer-motion';
import { db } from '@/lib/firebase';
import { errorMessage } from '@/lib/errors';
import { submitRecording } from '@/lib/ops/learner';
import { orderedVerses, unlockedVerses } from '@/lib/sequence';
import { sanitizeHtml } from '@/lib/sanitize';
import { pathTo } from '@/lib/tree';
import { timeAgo } from '@/lib/format';
import { celebrate } from '@/lib/celebrate';
import type { Reply, Submission } from '@/lib/types';
import { useAuth } from '@/stores/auth';
import { toast } from '@/stores/ui';
import { useCollection } from '@/hooks/useFirestore';
import { useHasAccess, useNodes, usePlaylist, useVerseStatuses, useVerses } from '@/hooks/useLearner';
import { Breadcrumbs, Button, Card, EmptyState, Icon, ListSkeleton, Skeleton, StatusChip, Tabs, type VerseState } from '@/components/ui';
import { Page } from '@/components/layout/Page';
import { LoopPlayer } from '@/components/media/LoopPlayer';
import { Recorder, type Recording } from '@/components/media/Recorder';
import { MediaPlayer } from '@/components/media/MediaPlayer';
import { UploadProgress } from '@/components/media/UploadProgress';

function Replies({ sid }: { sid: string }) {
  const replies = useCollection<Reply>(query(collection(db, 'submissions', sid, 'replies'), orderBy('createdAt', 'asc')), `replies-${sid}`);
  if (!replies.data.length) return null;
  return (
    <ul className="mt-3 space-y-3 border-l-2 border-primary/30 pl-4">
      {replies.data.map((r) => (
        <li key={r.id}>
          <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
            <span className="flex items-center gap-1.5 font-semibold text-primary">
              <Icon name="lotus" size={16} /> {r.authorLabel || 'Your Teacher'}
            </span>
            <StatusChip status={r.status} />
            <span className="text-xs text-muted">{timeAgo(r.createdAt)}</span>
          </div>
          {r.text && <p className="whitespace-pre-wrap text-sm">{r.text}</p>}
          {r.mediaId && (
            <div className="mt-2">
              <MediaPlayer mediaId={r.mediaId} kind={r.kind} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function VersePage() {
  const { pid, vid } = useParams<{ pid: string; vid: string }>();
  const uid = useAuth((s) => s.user?.uid);
  const playlist = usePlaylist(pid);
  const nodes = useNodes(pid);
  const verses = useVerses(pid);
  const statuses = useVerseStatuses(pid);
  const { access } = useHasAccess(pid, playlist.data);
  const [listened, setListened] = useState(false);
  const [kind, setKind] = useState<'audio' | 'video'>('audio');
  const [progress, setProgress] = useState<number | null>(null);
  const [practiceKey, setPracticeKey] = useState(0);

  const history = useCollection<Submission>(
    uid && pid && vid
      ? query(collection(db, 'submissions'), where('uid', '==', uid), where('vid', '==', vid), orderBy('createdAt', 'desc'))
      : null,
    `subs-${uid}-${vid}`,
  );

  const verse = verses.data.find((v) => v.id === vid);
  const ordered = useMemo(() => orderedVerses(nodes.data, verses.data), [nodes.data, verses.data]);
  const statusMap = useMemo(() => new Map(statuses.data.map((s) => [s.id, s.status])), [statuses.data]);
  const unlocked = useMemo(() => unlockedVerses(ordered, statusMap, !!playlist.data?.sequentialUnlock), [ordered, statusMap, playlist.data]);
  const idx = ordered.findIndex((v) => v.id === vid);
  const prev = idx > 0 ? ordered[idx - 1] : undefined;
  const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : undefined;
  const status = (statusMap.get(vid ?? '') as VerseState | undefined) ?? 'NOT_STARTED';

  useEffect(() => {
    setListened(false);
    setProgress(null);
    if (verse) setKind(verse.hasAudio || !verse.hasVideo ? 'audio' : 'video');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vid, verse?.hasAudio, verse?.hasVideo]);

  // Celebrate an approval the first time the learner sees it.
  useEffect(() => {
    if (status !== 'APPROVED' || !vid) return;
    const key = `lc-celebrated-${uid}-${vid}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch {
      return;
    }
    celebrate();
  }, [status, uid, vid]);

  const submit = async (rec: Recording) => {
    if (!pid || !vid) return;
    try {
      setProgress(0);
      await submitRecording(pid, playlist.data!, verse!, rec.blob, kind, { onProgress: setProgress, durationSec: rec.durationSec });
      toast.success('Sent to your teacher. You will be notified when they reply.');
      celebrate();
      setPracticeKey((k) => k + 1);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setProgress(null);
    }
  };

  if (playlist.loading || verses.loading) {
    return (
      <Page>
        <Skeleton className="mb-4 h-8 w-1/2" />
        <Skeleton className="mb-6 h-72 w-full rounded-4xl" />
        <ListSkeleton rows={2} />
      </Page>
    );
  }
  if (!playlist.data || !verse) {
    return (
      <Page title="Verse not found">
        <EmptyState title="Verse not found" action={<Link to={pid ? `/p/${pid}` : '/'}><Button>Back</Button></Link>} />
      </Page>
    );
  }

  const trail = pathTo(nodes.data, verse.nodeId);
  const isUnlocked = unlocked.has(verse.id);

  return (
    <Page title={verse.name}>
      <Breadcrumbs
        items={[
          { label: playlist.data.title, to: `/p/${pid}` },
          ...trail.map((n) => ({ label: n.name, to: `/p/${pid}/n/${n.id}` })),
          { label: verse.name },
        ]}
      />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-4xl font-semibold sm:text-5xl">{verse.name}</h1>
          {verse.firstLine && <p lang="sa" className="mt-1 font-chant text-xl text-primary">{verse.firstLine}</p>}
        </div>
        <StatusChip status={status} />
      </div>

      {!isUnlocked ? (
        <EmptyState
          art="diya"
          title="Complete the previous verse first"
          message="This playlist unlocks verses one at a time, after your teacher approves the previous one."
          action={prev && <Link to={`/p/${pid}/v/${prev.id}`}><Button icon="chevron-left">Previous verse</Button></Link>}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <div className="space-y-6">
            <LoopPlayer
              audioMediaId={verse.hasAudio ? verse.audioMediaId : null}
              videoMediaId={verse.hasVideo ? verse.videoMediaId : null}
              onComplete={() => setListened(true)}
            />

            {access && (
              <section aria-labelledby="practice-h">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h2 id="practice-h" className="text-2xl font-semibold">
                    Your turn <span className="text-base font-normal text-muted">· chant once</span>
                  </h2>
                  <Tabs
                    items={[
                      { id: 'audio', label: 'Audio', icon: 'mic' },
                      { id: 'video', label: 'Video', icon: 'video' },
                    ]}
                    value={kind}
                    onChange={setKind}
                  />
                </div>
                <AnimatePresence>
                  {listened && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-3 text-sm text-success">
                      Great listening! Now record yourself chanting the verse once.
                    </motion.p>
                  )}
                </AnimatePresence>
                <Recorder key={`${kind}-${practiceKey}`} kind={kind} hint="Chant the verse once, then tap stop. You can listen back and re-record before sending." confirmLabel="Send to teacher" busy={progress != null} onConfirm={submit} />
                {progress != null && (
                  <div className="mt-3">
                    <UploadProgress value={progress} label="Sending your recording" />
                  </div>
                )}
              </section>
            )}
          </div>

          <div className="space-y-6">
            {verse.details && (
              <Card className="p-5">
                <h2 className="mb-2 flex items-center gap-2 text-xl font-semibold">
                  <Icon name="book" className="text-primary" /> Meaning & details
                </h2>
                <div className="rich-text text-[15px] leading-relaxed" dangerouslySetInnerHTML={{ __html: sanitizeHtml(verse.details) }} />
              </Card>
            )}

            <Card className="p-5">
              <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold">
                <Icon name="clock" className="text-primary" /> Your submissions
              </h2>
              {history.loading ? (
                <ListSkeleton rows={2} />
              ) : history.data.length === 0 ? (
                <p className="text-sm text-muted">No submissions yet. Your recordings and your teacher's feedback will appear here.</p>
              ) : (
                <ul className="space-y-5">
                  {history.data.map((s) => (
                    <li key={s.id} className="rounded-2xl bg-ink/[.03] p-3">
                      <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                        <span className="text-muted">{timeAgo(s.createdAt)}</span>
                        <StatusChip status={s.status} />
                      </div>
                      <MediaPlayer mediaId={s.mediaId} kind={s.kind} />
                      <Replies sid={s.id} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      <nav className="mt-10 flex items-center justify-between gap-3" aria-label="Verse navigation">
        {prev ? (
          <Link to={`/p/${pid}/v/${prev.id}`}>
            <Button variant="secondary" icon="chevron-left">{prev.name}</Button>
          </Link>
        ) : (
          <span />
        )}
        {next && unlocked.has(next.id) && (
          <Link to={`/p/${pid}/v/${next.id}`}>
            <Button variant="secondary" iconRight="chevron-right">{next.name}</Button>
          </Link>
        )}
      </nav>
    </Page>
  );
}
