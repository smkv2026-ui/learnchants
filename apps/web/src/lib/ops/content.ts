import { collection, deleteDoc, doc, getDocs, writeBatch, type DocumentReference } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { deleteMedia } from '@/lib/media';

/** Admin: recompute ``verseCount`` on the playlist and every node (descendant totals). */
export async function recountVerses(pid: string): Promise<number> {
  const [nodesSnap, versesSnap] = await Promise.all([
    getDocs(collection(db, 'playlists', pid, 'nodes')),
    getDocs(collection(db, 'playlists', pid, 'verses')),
  ]);
  const nodes = new Map(nodesSnap.docs.map((d) => [d.id, d.data() as { parentId?: string | null; verseCount?: number }]));
  const counts = new Map<string, number>([...nodes.keys()].map((k) => [k, 0]));
  versesSnap.docs.forEach((v) => {
    let nid = v.data().nodeId as string | null;
    const seen = new Set<string>();
    while (nid && nodes.has(nid) && !seen.has(nid)) {
      seen.add(nid);
      counts.set(nid, (counts.get(nid) ?? 0) + 1);
      nid = nodes.get(nid)!.parentId ?? null;
    }
  });
  const batch = writeBatch(db);
  counts.forEach((c, nid) => {
    if (nodes.get(nid)!.verseCount !== c) batch.update(doc(db, 'playlists', pid, 'nodes', nid), { verseCount: c });
  });
  batch.update(doc(db, 'playlists', pid), { verseCount: versesSnap.size });
  await batch.commit();
  return versesSnap.size;
}

/** Admin: delete a playlist with its sections, verses, materials, payment info and stored media. */
export async function deletePlaylist(pid: string): Promise<void> {
  // Remove stored media (Firestore chunks / Drive files) first, then the content docs.
  const refs: DocumentReference[] = [];
  for (const sub of ['verses', 'nodes', 'materials', 'payment']) {
    const snap = await getDocs(collection(db, 'playlists', pid, sub));
    for (const d of snap.docs) {
      for (const key of ['audioMediaId', 'videoMediaId', 'mediaId']) await deleteMedia(d.data()[key]).catch(() => undefined);
      refs.push(d.ref);
    }
  }
  // Batches hold at most 500 writes; the playlist doc goes last so a partial failure can be retried.
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db);
    refs.slice(i, i + 450).forEach((r) => batch.delete(r));
    await batch.commit();
  }
  await deleteDoc(doc(db, 'playlists', pid));
  await deleteDoc(doc(db, 'adminPlaylists', pid)).catch(() => undefined);
}
