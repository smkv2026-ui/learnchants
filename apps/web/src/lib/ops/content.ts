import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';

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
