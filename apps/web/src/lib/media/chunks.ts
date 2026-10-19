import {
  Bytes,
  collection,
  doc,
  getDocs,
  getDocsFromCache,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

/** Firestore stores bytes in chunk documents (Spark plan has no Cloud Storage). */
export const CHUNK_BYTES = 700_000;
export const MAX_CHUNKS = 12;
export const MAX_FIRESTORE_BYTES = CHUNK_BYTES * MAX_CHUNKS; // ~8.4 MB

export function chunkCountFor(size: number): number {
  return Math.max(1, Math.ceil(size / CHUNK_BYTES));
}

export interface MediaMeta {
  purpose: 'verse_audio' | 'verse_video' | 'material' | 'submission' | 'reply' | 'payment_screenshot';
  pid: string;
  kind?: 'audio' | 'video' | null;
  mimeType: string;
  uploaderUid: string;
  learnerUid?: string | null;
  vid?: string | null;
  fileName?: string | null;
}

/** Write a blob as ``media/{id}`` + ``media/{id}/chunks/{n}``; returns the media id. */
export async function putChunked(
  blob: Blob,
  meta: MediaMeta,
  opts: { onProgress?: (f: number) => void; durationSec?: number | null } = {},
): Promise<string> {
  if (blob.size > MAX_FIRESTORE_BYTES) {
    throw new Error(`File is too large for built-in storage (max ${(MAX_FIRESTORE_BYTES / 1e6).toFixed(1)} MB). Connect Google Drive for larger files.`);
  }
  const ref = doc(collection(db, 'media'));
  const chunkCount = chunkCountFor(blob.size);
  await setDoc(ref, {
    ...meta,
    learnerUid: meta.learnerUid ?? null,
    vid: meta.vid ?? null,
    kind: meta.kind ?? null,
    fileName: meta.fileName ?? null,
    store: 'firestore',
    size: blob.size,
    chunkCount,
    status: 'uploading',
    createdAt: serverTimestamp(),
  });
  opts.onProgress?.(0);
  for (let i = 0; i < chunkCount; i++) {
    const part = new Uint8Array(await blob.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES).arrayBuffer());
    await setDoc(doc(db, 'media', ref.id, 'chunks', String(i)), { data: Bytes.fromUint8Array(part) });
    opts.onProgress?.((i + 1) / chunkCount);
  }
  await updateDoc(ref, { status: 'ready', durationSec: opts.durationSec ?? null });
  return ref.id;
}

/** Reassemble a chunked file (served from the offline cache when possible). */
export async function readChunked(mediaId: string, chunkCount: number, mimeType: string): Promise<Blob> {
  const col = collection(db, 'media', mediaId, 'chunks');
  let snap = await getDocsFromCache(col).catch(() => null);
  if (!snap || snap.size < chunkCount) snap = await getDocs(col);
  const parts = snap.docs
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((d) => (d.data().data as Bytes).toUint8Array());
  return new Blob(parts as BlobPart[], { type: mimeType });
}

export async function deleteChunks(mediaId: string): Promise<void> {
  const snap = await getDocs(collection(db, 'media', mediaId, 'chunks'));
  if (!snap.size) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}
