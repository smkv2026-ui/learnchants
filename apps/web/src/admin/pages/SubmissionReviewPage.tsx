import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { collection, doc, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { errorMessage } from '@/lib/errors';
import { reviewSubmission } from '@/lib/ops/review';
import { sanitizeHtml } from '@/lib/sanitize';
import { timeAgo } from '@/lib/format';
import type { Reply, Submission, Verse } from '@/lib/types';
import { toast } from '@/stores/ui';
import { useCollection, useDoc } from '@/hooks/useFirestore';
import { Breadcrumbs, Button, Card, EmptyState, Icon, Skeleton, StatusChip, Tabs, TextArea } from '@/components/ui';
import { MediaPlayer } from '@/components/media/MediaPlayer';
import { MediaInput } from '@/components/media/MediaInput';
import { LoopPlayer } from '@/components/media/LoopPlayer';
import type { Recording } from '@/components/media/Recorder';
import { UploadProgress } from '@/components/media/UploadProgress';
import { AdminHeader } from '../components/AdminLayout';

export default function SubmissionReviewPage() {
  const { sid } = useParams<{ sid: string }>();
  const navigate = useNavigate();
  const sub = useDoc<Submission>(sid ? doc(db, 'submissions', sid) : null);
  const s = sub.data;
  const verse = useDoc<Verse>(s ? doc(db, 'playlists', s.pid, 'verses', s.vid) : null);
  const replies = useCollection<Reply>(sid ? query(collection(db, 'submissions', sid, 'replies'), orderBy('createdAt', 'asc')) : null, `admin-replies-${sid}`);
  const nextInQueue = useCollection<Submission>(query(collection(db, 'submissions'), where('status', '==', 'SUBMITTED'), orderBy('createdAt', 'desc'), limit(5)), 'next-queue');
  const [text, setText] = useState('');
  const [replyKind, setReplyKind] = useState<'audio' | 'video'>('audio');
  const [rec, setRec] = useState<Recording | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState<'APPROVED' | 'NEEDS_WORK' | null>(null);

  if (sub.loading) return <Skeleton className="h-96 w-full rounded-3xl" />;
  if (!s || !sid) return <EmptyState title="Submission not found" action={<Link to="/admin/reviews"><Button>Back to queue</Button></Link>} />;

  const decide = async (status: 'APPROVED' | 'NEEDS_WORK') => {
    if (status === 'NEEDS_WORK' && !text.trim() && !rec) return toast.error('Add a correction (text or recording) so the learner knows what to improve.');
    setBusy(status);
    try {
      if (rec) setProgress(0);
      await reviewSubmission(
        { ...s, id: sid },
        status,
        text,
        rec ? { blob: rec.blob, kind: replyKind, durationSec: rec.durationSec } : null,
        setProgress,
      );
      toast.success(status === 'APPROVED' ? 'Approved. The learner has been notified.' : 'Corrections sent.');
      setText('');
      setRec(null);
      const next = nextInQueue.data.find((n) => n.id !== sid);
      navigate(next ? `/admin/reviews/${next.id}` : '/admin/reviews');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  return (
    <>
      <Breadcrumbs items={[{ label: 'Review queue', to: '/admin/reviews' }, { label: `${s.userName ?? 'Learner'} · ${s.verseName}` }]} />
      <AdminHeader
        title={s.verseName ?? 'Submission'}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link to={`/admin/learners/${s.uid}`} className="font-medium text-primary hover:underline">{s.userName ?? 'Learner'}</Link>
            · {s.playlistTitle} · {timeAgo(s.createdAt)} <StatusChip status={s.status} />
          </span>
        }
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold"><Icon name="mic" className="text-primary" /> Learner's recording</h2>
            <MediaPlayer mediaId={s.mediaId} kind={s.kind} />
          </Card>
          {verse.data && (verse.data.hasAudio || verse.data.hasVideo) && (
            <div>
              <h2 className="mb-3 text-xl font-semibold">Reference</h2>
              <LoopPlayer audioMediaId={verse.data.hasAudio ? verse.data.audioMediaId : null} videoMediaId={verse.data.hasVideo ? verse.data.videoMediaId : null} autoPlay={false} compact />
            </div>
          )}
          {verse.data?.details && (
            <Card className="p-5">
              <div className="rich-text text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(verse.data.details) }} />
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {replies.data.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 text-xl font-semibold">Previous replies</h2>
              <ul className="space-y-4">
                {replies.data.map((r) => (
                  <li key={r.id} className="border-l-2 border-primary/30 pl-3">
                    <div className="mb-1 flex items-center gap-2 text-xs text-muted"><StatusChip status={r.status} /> {timeAgo(r.createdAt)}</div>
                    {r.text && <p className="whitespace-pre-wrap text-sm">{r.text}</p>}
                    {r.mediaId && <div className="mt-2"><MediaPlayer mediaId={r.mediaId} kind={r.kind} /></div>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card className="space-y-4 p-5">
            <h2 className="text-xl font-semibold">Your feedback</h2>
            <p className="text-xs text-muted">Learners see your reply labelled “Your Teacher”.</p>
            <TextArea label="Correction / encouragement" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} placeholder="e.g. Lengthen the ‘ā’ in रुद्र; the svara rises on ‘ma’." />
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="label !mb-0">Optional recorded reply</span>
                <Tabs items={[{ id: 'audio', label: 'Audio', icon: 'mic' }, { id: 'video', label: 'Video', icon: 'video' }]} value={replyKind} onChange={(k) => { setReplyKind(k); setRec(null); }} />
              </div>
              <MediaInput key={replyKind} kind={replyKind} value={rec} onChange={setRec} />
            </div>
            <UploadProgress value={progress} label="Uploading reply" />
            <div className="flex flex-wrap gap-3 border-t hairline pt-4">
              <Button size="lg" icon="check" loading={busy === 'APPROVED'} disabled={!!busy} onClick={() => void decide('APPROVED')} className="flex-1">
                Approve
              </Button>
              <Button size="lg" variant="outline" icon="refresh" loading={busy === 'NEEDS_WORK'} disabled={!!busy} onClick={() => void decide('NEEDS_WORK')} className="flex-1">
                Needs work
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
