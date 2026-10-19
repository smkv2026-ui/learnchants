import { buildTree, flatten } from './tree';
import type { NodeDoc, Verse, VerseStatus, WithId } from './types';

/** Verses in learning order: depth-first through the tree, verses by ``order``. */
export function orderedVerses(nodes: WithId<NodeDoc>[], verses: WithId<Verse>[]): WithId<Verse>[] {
  const flat = flatten(buildTree(nodes));
  const rank = new Map(flat.map((n, i) => [n.id, i]));
  return [...verses].sort(
    (a, b) => (rank.get(a.nodeId) ?? 1e9) - (rank.get(b.nodeId) ?? 1e9) || (a.order ?? 0) - (b.order ?? 0),
  );
}

/**
 * With sequential unlocking, a verse is open when every earlier verse is approved.
 * Returns the set of unlocked verse ids.
 */
export function unlockedVerses(ordered: WithId<Verse>[], statuses: Map<string, VerseStatus['status']>, sequential: boolean): Set<string> {
  if (!sequential) return new Set(ordered.map((v) => v.id));
  const open = new Set<string>();
  for (const v of ordered) {
    open.add(v.id);
    if (statuses.get(v.id) !== 'APPROVED') break;
  }
  return open;
}
