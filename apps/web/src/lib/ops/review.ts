import { collection, deleteDoc, doc, getDoc, getDocs, increment, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { archiveToDrive, deleteMedia, storeMedia } from '@/lib/media';
import { driveConnected } from '@/lib/media/drive';
import type { Reply, Submission, WithId } from '@/lib/types';
import { auditInBatch, me, notifyInBatch } from './common';

export const TEACHER_LABEL = 'Your Teacher';

/** Teacher reply + Approve / Needs work, with progress roll-up and notification. */
export async function reviewSubmission(
  sub: WithId<Submission>,
  status: 'APPROVED' | 'NEEDS_WORK',
  text: string,
  reply?: { blob: Blob; kind: 'audio' | 'video'; durationSec?: number } | null,
  onProgress?: (f: number) => void,
): Promise<{ celebrate: string[] }> {
  const u = me();
  if (status === 'NEEDS_WORK' && !text.trim() && !reply) throw new Error('Add a correction (text or recording) when asking for more work.');
  let replyMediaId: string | null = null;
  if (reply) {
    replyMediaId = await storeMedia(
      reply.blob,
      { purpose: 'reply', pid: sub.pid, vid: sub.vid, kind: reply.kind, learnerUid: sub.uid },
      { onProgress, durationSec: reply.durationSec, useDrive: true },
    );
  }
  const vsRef = doc(db, 'users', sub.uid, 'progress', sub.pid, 'verseStatus', sub.vid);
  const progRef = doc(db, 'users', sub.uid, 'progress', sub.pid);
  const [vs, prog, playlist, adminRec] = await Promise.all([
    getDoc(vsRef),
    getDoc(progRef),
    getDoc(doc(db, 'playlists', sub.pid)),
    getDoc(doc(db, 'adminUsers', u.uid)),
  ]);
  const prev = vs.data()?.status;
  const delta = status === 'APPROVED' && prev !== 'APPROVED' ? 1 : status !== 'APPROVED' && prev === 'APPROVED' ? -1 : 0;

  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'submissions', sub.id, 'replies')), {
    text: text.trim() || null,
    mediaId: replyMediaId,
    kind: reply?.kind ?? null,
    status,
    authorUid: u.uid,
    authorName: adminRec.data()?.displayName ?? null,
    authorLabel: TEACHER_LABEL,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'submissions', sub.id), { status, replyCount: increment(1), updatedAt: serverTimestamp(), lastReplyAt: serverTimestamp() });
  batch.set(vsRef, { status, pid: sub.pid, nodeId: sub.nodeId ?? null, lastSubmissionId: sub.id, updatedAt: serverTimestamp() });
  const approvedAfter = (prog.data()?.approvedCount ?? 0) + delta;
  if (prog.exists()) {
    if (delta) batch.update(progRef, { approvedCount: increment(delta), updatedAt: serverTimestamp() });
  } else {
    batch.set(progRef, { pid: sub.pid, uid: sub.uid, title: sub.playlistTitle ?? null, approvedCount: Math.max(0, delta), updatedAt: serverTimestamp() });
  }
  const celebrate: string[] = [];
  const link = `/p/${sub.pid}/v/${sub.vid}`;
  if (status === 'APPROVED') {
    notifyInBatch(batch, sub.uid, 'approved', `${TEACHER_LABEL} approved your chanting of “${sub.verseName}”. Wonderful!`, link);
    const total = playlist.data()?.verseCount ?? 0;
    if (delta > 0 && total && approvedAfter >= total) {
      celebrate.push('playlist');
      notifyInBatch(batch, sub.uid, 'playlist_complete', `You completed “${playlist.data()?.title}”! 🎉`, `/p/${sub.pid}`);
    }
  } else {
    notifyInBatch(batch, sub.uid, 'needs_work', `${TEACHER_LABEL} sent corrections for “${sub.verseName}”.`, link);
  }
  auditInBatch(batch, `submission.${status.toLowerCase()}`, { submissionId: sub.id, uid: sub.uid, pid: sub.pid, vid: sub.vid });
  await batch.commit();

  // Free Firestore quota: move the reviewed recording into the teacher's Drive.
  if (driveConnected()) await archiveToDrive(sub.mediaId).catch(() => undefined);
  return { celebrate };
}

/** Admin: delete one teacher reply (and its recording). */
export async function deleteReply(sid: string, reply: WithId<Reply>): Promise<void> {
  await deleteMedia(reply.mediaId).catch(() => undefined);
  await deleteDoc(doc(db, 'submissions', sid, 'replies', reply.id));
  await updateDoc(doc(db, 'submissions', sid), { replyCount: increment(-1), updatedAt: serverTimestamp() }).catch(() => undefined);
}

/**
 * Admin: delete a learner recording with its replies. An approved verse stays
 * approved; otherwise the verse goes back to "not started" so the learner can record again.
 */
export async function deleteSubmission(sub: WithId<Submission>): Promise<void> {
  const replies = await getDocs(collection(db, 'submissions', sub.id, 'replies'));
  for (const r of replies.docs) await deleteMedia(r.data().mediaId).catch(() => undefined);
  await deleteMedia(sub.mediaId).catch(() => undefined);
  const vsRef = doc(db, 'users', sub.uid, 'progress', sub.pid, 'verseStatus', sub.vid);
  const vs = await getDoc(vsRef);
  const batch = writeBatch(db);
  replies.docs.forEach((r) => batch.delete(r.ref));
  batch.delete(doc(db, 'submissions', sub.id));
  if (vs.exists() && vs.data().lastSubmissionId === sub.id && vs.data().status !== 'APPROVED') batch.delete(vsRef);
  auditInBatch(batch, 'submission.deleted', { submissionId: sub.id, uid: sub.uid, pid: sub.pid, vid: sub.vid });
  await batch.commit();
}
