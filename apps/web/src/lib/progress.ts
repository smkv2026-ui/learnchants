import type { NodeDoc, Progress, WithId } from './types';

export function pct(done: number, total: number): number {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

export function playlistPct(p?: Progress | null): number {
  return p ? pct(p.approvedCount, p.totalCount) : 0;
}

export function nodePct(p: Progress | null | undefined, node: WithId<NodeDoc>): number {
  return pct(p?.nodeApproved?.[node.id] ?? 0, node.verseCount ?? 0);
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
