import type { NodeDoc, Progress, Verse, WithId } from './types';

export function pct(done: number, total: number): number {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

export function playlistPct(p: Progress | null | undefined, total: number | null | undefined): number {
  return p ? pct(p.approvedCount, total ?? 0) : 0;
}

/** Approved verses inside ``node`` (any depth), from the learner's verse statuses. */
export function nodeApproved(
  node: WithId<NodeDoc>,
  nodes: WithId<NodeDoc>[],
  verses: WithId<Verse>[],
  statuses: Map<string, string>,
): number {
  const parent = new Map(nodes.map((n) => [n.id, n.parentId ?? null]));
  const within = (nid: string | null | undefined): boolean => {
    const seen = new Set<string>();
    while (nid && !seen.has(nid)) {
      if (nid === node.id) return true;
      seen.add(nid);
      nid = parent.get(nid) ?? null;
    }
    return false;
  };
  return verses.filter((v) => statuses.get(v.id) === 'APPROVED' && within(v.nodeId)).length;
}

export function nodePct(node: WithId<NodeDoc>, nodes: WithId<NodeDoc>[], verses: WithId<Verse>[], statuses: Map<string, string>): number {
  return pct(nodeApproved(node, nodes, verses, statuses), node.verseCount ?? 0);
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Consecutive days of activity ending today (or yesterday, so a streak survives until midnight). */
export function computeStreak(days: string[] | undefined, today = new Date()): number {
  if (!days?.length) return 0;
  const set = new Set(days);
  const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (!set.has(dayKey(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (set.has(dayKey(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}
