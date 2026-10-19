import { arrayUnion, collection, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { storeMedia } from '@/lib/media';
import type { Playlist, Verse, WithId } from '@/lib/types';
import { dayKey, me } from './common';

/** Learner sends a practice recording to the teacher. */
export async function submitRecording(
  pid: string,
  playlist: Playlist,
  verse: WithId<Verse>,
  blob: Blob,
  kind: 'audio' | 'video',
  opts: { durationSec?: number; onProgress?: (f: number) => void } = {},
): Promise<string> {
  const u = me();
  const mediaId = await storeMedia(blob, { purpose: 'submission', pid, vid: verse.id, kind, learnerUid: u.uid }, opts);
  const [user, vs, progress] = await Promise.all([
    getDoc(doc(db, 'users', u.uid)),
    getDoc(doc(db, 'users', u.uid, 'progress', pid, 'verseStatus', verse.id)),
    getDoc(doc(db, 'users', u.uid, 'progress', pid)),
  ]);
  const subRef = doc(collection(db, 'submissions'));
  const batch = writeBatch(db);
  batch.set(subRef, {
    uid: u.uid,
    userName: user.data()?.displayName ?? u.displayName ?? null,
    pid,
    vid: verse.id,
    nodeId: verse.nodeId ?? null,
    playlistTitle: playlist.title,
    verseName: verse.name,
    kind,
    mediaId,
    mimeType: blob.type.split(';')[0],
    durationSec: opts.durationSec ?? null,
    status: 'SUBMITTED',
    replyCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  if (vs.data()?.status !== 'APPROVED') {
    batch.set(vs.ref, { status: 'SUBMITTED', pid, nodeId: verse.nodeId ?? null, lastSubmissionId: subRef.id, updatedAt: serverTimestamp() });
  }
  if (progress.exists()) {
    batch.update(progress.ref, { updatedAt: serverTimestamp(), lastVerseId: verse.id, title: playlist.title });
  } else {
    batch.set(progress.ref, { pid, uid: u.uid, title: playlist.title, approvedCount: 0, lastVerseId: verse.id, startedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  batch.set(doc(db, 'users', u.uid, 'meta', 'stats'), { activityDays: arrayUnion(dayKey()), lastActiveAt: serverTimestamp() }, { merge: true });
  await batch.commit();
  return subRef.id;
}
