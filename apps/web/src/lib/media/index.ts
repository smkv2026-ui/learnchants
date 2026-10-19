import { collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { extensionFor } from '@/lib/recorder';
import { deleteChunks, putChunked, readChunked, type MediaMeta } from './chunks';
import {
  DEFAULT_ROOT,
  createFolder,
  driveConnected,
  ensureFolderPath,
  findFolder,
  publicDriveUrl,
  safeName,
  trashItem,
  uploadFile,
  type Segment,
} from './drive';

export { MAX_FIRESTORE_BYTES } from './chunks';
export type { MediaMeta } from './chunks';

export interface MediaDoc {
  purpose: MediaMeta['purpose'];
  pid: string;
  kind?: 'audio' | 'video' | null;
  mimeType: string;
  store: 'firestore' | 'drive';
  size: number;
  chunkCount: number;
  driveFileId?: string | null;
  status: 'uploading' | 'ready';
  learnerUid?: string | null;
  uploaderUid: string;
  durationSec?: number | null;
}

// ---------------------------------------------------------------- folder paths
async function nodeChain(pid: string, nid: string | null | undefined): Promise<{ id: string; name: string }[]> {
  const chain: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  while (nid && !seen.has(nid)) {
    seen.add(nid);
    const snap = await getDoc(doc(db, 'playlists', pid, 'nodes', nid));
    if (!snap.exists()) break;
    chain.unshift({ id: nid, name: snap.data().name });
    nid = snap.data().parentId;
  }
  return chain;
}

/** ``<Playlist>/<Node>/…/<Verse>`` as stable (id-keyed) segments. */
export async function contentSegments(pid: string, opts: { nodeId?: string | null; vid?: string | null } = {}): Promise<Segment[]> {
  const p = await getDoc(doc(db, 'playlists', pid));
  const segs: Segment[] = [[`p:${pid}`, p.data()?.title ?? 'Playlist']];
  let nodeId = opts.nodeId;
  let verseName: string | null = null;
  if (opts.vid) {
    const v = await getDoc(doc(db, 'playlists', pid, 'verses', opts.vid));
    nodeId = v.data()?.nodeId;
    verseName = v.data()?.name ?? 'Verse';
  }
  for (const n of await nodeChain(pid, nodeId)) segs.push([`n:${n.id}`, n.name]);
  if (opts.vid) segs.push([`v:${opts.vid}`, verseName!]);
  return segs;
}

/** ``<Playlist>/_Learners/<Name>_<uid>/<Verse>`` */
export async function learnerSegments(pid: string, learnerUid: string, vid: string | null): Promise<Segment[]> {
  const [p, u, v] = await Promise.all([
    getDoc(doc(db, 'playlists', pid)),
    getDoc(doc(db, 'users', learnerUid)),
    vid ? getDoc(doc(db, 'playlists', pid, 'verses', vid)) : Promise.resolve(null),
  ]);
  const segs: Segment[] = [
    [`p:${pid}`, p.data()?.title ?? 'Playlist'],
    ['_Learners', '_Learners'],
    [`u:${learnerUid}`, `${safeName(u.data()?.displayName ?? 'Learner')}_${learnerUid}`],
  ];
  if (vid) segs.push([`lv:${vid}`, v?.data()?.name ?? 'Verse']);
  return segs;
}

/** Playlist override > admin's default folder > auto-created ``LearnChants``. */
export async function storageRoot(pid: string | null): Promise<string> {
  const me = auth.currentUser!.uid;
  if (pid) {
    const ap = await getDoc(doc(db, 'adminPlaylists', pid));
    if (ap.data()?.storageFolderId && ap.data()?.ownerUid === me) return ap.data()!.storageFolderId;
  }
  const settingsRef = doc(db, 'adminSettings', me);
  const s = await getDoc(settingsRef);
  if (s.data()?.defaultFolderId) return s.data()!.defaultFolderId;
  const folder = (await findFolder(null, DEFAULT_ROOT)) ?? (await createFolder(DEFAULT_ROOT, null));
  await setDoc(settingsRef, { defaultFolderId: folder.id, defaultFolderName: folder.name }, { merge: true });
  return folder.id;
}

function fileNameFor(meta: MediaMeta, blob: Blob): string {
  const ext = meta.fileName?.includes('.') ? meta.fileName.split('.').pop()! : extensionFor(blob.type || meta.mimeType);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  switch (meta.purpose) {
    case 'verse_audio':
      return `audio.${ext}`;
    case 'verse_video':
      return `video.${ext}`;
    case 'material':
      return meta.fileName || `material.${ext}`;
    case 'reply':
      return `reply-${stamp}.${ext}`;
    default:
      return `${stamp}.${ext}`;
  }
}

async function segmentsFor(meta: MediaMeta, extra: { nodeId?: string | null }): Promise<Segment[]> {
  if (meta.purpose === 'verse_audio' || meta.purpose === 'verse_video') {
    return [...(await contentSegments(meta.pid, { vid: meta.vid })), [meta.kind!, meta.kind!]];
  }
  if (meta.purpose === 'material') return [...(await contentSegments(meta.pid, { nodeId: extra.nodeId })), ['materials', 'materials']];
  if (meta.purpose === 'payment_screenshot') return [...(await learnerSegments(meta.pid, meta.learnerUid!, null)), ['payments', 'payments']];
  const segs = await learnerSegments(meta.pid, meta.learnerUid!, meta.vid ?? null);
  return meta.purpose === 'reply' ? [...segs, ['replies', 'replies']] : segs;
}

// ---------------------------------------------------------------- public API
/**
 * Store a file and register it in ``media/{id}``. Teachers with Google Drive
 * connected store into the mirrored Drive folders; everything else (and every
 * learner upload) uses Firestore chunks.
 */
export async function storeMedia(
  blob: Blob,
  meta: Omit<MediaMeta, 'uploaderUid' | 'mimeType'> & { mimeType?: string },
  opts: { onProgress?: (f: number) => void; durationSec?: number | null; nodeId?: string | null; useDrive?: boolean } = {},
): Promise<string> {
  const full: MediaMeta = { ...meta, mimeType: (meta.mimeType || blob.type || 'application/octet-stream').split(';')[0], uploaderUid: auth.currentUser!.uid };
  if (!(opts.useDrive && driveConnected())) return putChunked(blob, full, opts);

  const folder = await ensureFolderPath(full.uploaderUid, await storageRoot(full.pid), await segmentsFor(full, { nodeId: opts.nodeId }));
  const fileId = await uploadFile(blob, folder, fileNameFor(full, blob), opts.onProgress);
  const ref = doc(collection(db, 'media'));
  await setDoc(ref, {
    ...full,
    learnerUid: full.learnerUid ?? null,
    vid: full.vid ?? null,
    kind: full.kind ?? null,
    fileName: full.fileName ?? null,
    store: 'drive',
    driveFileId: fileId,
    size: blob.size,
    chunkCount: 0,
    status: 'ready',
    durationSec: opts.durationSec ?? null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export class LockedError extends Error {
  locked = true;
}

const urlCache = new Map<string, { url: string; mimeType: string; external: boolean }>();

/** A playable URL for a media id: a Drive link or an object URL from Firestore chunks. */
export async function resolveMedia(mediaId: string): Promise<{ url: string; mimeType: string; external: boolean }> {
  const hit = urlCache.get(mediaId);
  if (hit) return hit;
  let snap;
  try {
    snap = await getDoc(doc(db, 'media', mediaId));
  } catch (err) {
    if ((err as { code?: string }).code === 'permission-denied') throw new LockedError('This content is locked until your payment is approved.');
    throw err;
  }
  if (!snap.exists()) throw new Error('Media not found.');
  const m = snap.data() as MediaDoc;
  if (m.status !== 'ready') throw new Error('This file is still uploading.');
  const out =
    m.store === 'drive' && m.driveFileId
      ? { url: publicDriveUrl(m.driveFileId), mimeType: m.mimeType, external: true }
      : { url: URL.createObjectURL(await readChunked(mediaId, m.chunkCount, m.mimeType)), mimeType: m.mimeType, external: false };
  urlCache.set(mediaId, out);
  return out;
}

export async function fetchMediaBlob(mediaId: string): Promise<Blob> {
  const { url } = await resolveMedia(mediaId);
  return (await fetch(url)).blob();
}

/** Admin: remove a file wherever it lives (best effort for Drive). */
export async function deleteMedia(mediaId: string | null | undefined): Promise<void> {
  if (!mediaId) return;
  const ref = doc(db, 'media', mediaId);
  const snap = await getDoc(ref).catch(() => null);
  if (!snap?.exists()) return;
  const m = snap.data() as MediaDoc;
  if (m.store === 'drive' && m.driveFileId && driveConnected()) await trashItem(m.driveFileId);
  await deleteChunks(mediaId).catch(() => undefined);
  await deleteDoc(ref);
  urlCache.delete(mediaId);
}

/**
 * Admin: move a learner recording from Firestore into the teacher's Drive
 * (``_Learners/<Name>_<uid>/<Verse>``) to free Firestore quota.
 */
export async function archiveToDrive(mediaId: string): Promise<boolean> {
  if (!driveConnected()) return false;
  const ref = doc(db, 'media', mediaId);
  const snap = await getDoc(ref);
  const m = snap.data() as (MediaDoc & { vid?: string | null }) | undefined;
  if (!m || m.store !== 'firestore' || m.status !== 'ready' || !m.learnerUid) return false;
  const blob = await readChunked(mediaId, m.chunkCount, m.mimeType);
  const meta = { ...m, uploaderUid: auth.currentUser!.uid } as MediaMeta;
  const folder = await ensureFolderPath(meta.uploaderUid, await storageRoot(m.pid), await segmentsFor(meta, {}));
  const fileId = await uploadFile(blob, folder, fileNameFor(meta, blob));
  await updateDoc(ref, { store: 'drive', driveFileId: fileId, chunkCount: 0 });
  await deleteChunks(mediaId);
  urlCache.delete(mediaId);
  return true;
}

/** Admin: delete every stored file of a verse (used when deleting content). */
export async function deleteVerseMedia(pid: string, vid: string): Promise<void> {
  const v = await getDoc(doc(db, 'playlists', pid, 'verses', vid));
  await deleteMedia(v.data()?.audioMediaId);
  await deleteMedia(v.data()?.videoMediaId);
}

