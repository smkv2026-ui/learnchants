import { describe, expect, it } from 'vitest';
import { buildTree, descendants, flatten, pathTo, reorder } from './tree';
import { orderedVerses, unlockedVerses } from './sequence';
import { computeStreak, nodePct, pct } from './progress';

const nodes = [
  { id: 'cham', parentId: null, name: 'Chamakam', order: 2 },
  { id: 'nam', parentId: null, name: 'Namakam', order: 1 },
  { id: 'a2', parentId: 'nam', name: 'Anuvakam 2', order: 2, verseCount: 1 },
  { id: 'a1', parentId: 'nam', name: 'Anuvakam 1', order: 1, verseCount: 2 },
];
const verses = [
  { id: 'v3', nodeId: 'a2', name: 'V3', order: 1 },
  { id: 'v2', nodeId: 'a1', name: 'V2', order: 2 },
  { id: 'v1', nodeId: 'a1', name: 'V1', order: 1 },
];

describe('tree', () => {
  it('builds an ordered nested tree', () => {
    const t = buildTree(nodes);
    expect(t.map((n) => n.name)).toEqual(['Namakam', 'Chamakam']);
    expect(t[0].children.map((n) => n.name)).toEqual(['Anuvakam 1', 'Anuvakam 2']);
    expect(flatten(t).map((n) => n.depth)).toEqual([0, 1, 1, 0]);
  });
  it('computes paths and descendants', () => {
    expect(pathTo(nodes, 'a2').map((n) => n.id)).toEqual(['nam', 'a2']);
    expect([...descendants(nodes, 'nam')].sort()).toEqual(['a1', 'a2', 'nam']);
  });
  it('reorders and returns only changed orders', () => {
    const items = [{ id: 'a', order: 1 }, { id: 'b', order: 2 }, { id: 'c', order: 3 }];
    expect(reorder(items, 'c', 'a')).toEqual([['c', 1], ['a', 2], ['b', 3]]);
    expect(reorder(items, 'a', 'a')).toEqual([]);
  });
});

describe('sequence', () => {
  it('orders verses depth-first and unlocks sequentially', () => {
    const ordered = orderedVerses(nodes, verses);
    expect(ordered.map((v) => v.id)).toEqual(['v1', 'v2', 'v3']);
    expect([...unlockedVerses(ordered, new Map(), true)]).toEqual(['v1']);
    expect([...unlockedVerses(ordered, new Map([['v1', 'APPROVED']]), true)]).toEqual(['v1', 'v2']);
    expect(unlockedVerses(ordered, new Map(), false).size).toBe(3);
  });
});

describe('progress', () => {
  it('computes percentages and node progress', () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(0, 0)).toBe(0);
    const p = { pid: 'p', uid: 'u', approvedCount: 1, totalCount: 3, nodeApproved: { a1: 1 } };
    expect(nodePct(p, nodes[3])).toBe(50);
  });
  it('computes streaks that survive until midnight', () => {
    const today = new Date('2026-10-19T10:00:00Z');
    expect(computeStreak(['2026-10-17', '2026-10-18', '2026-10-19'], today)).toBe(3);
    expect(computeStreak(['2026-10-17', '2026-10-18'], today)).toBe(2);
    expect(computeStreak(['2026-10-15'], today)).toBe(0);
    expect(computeStreak([], today)).toBe(0);
  });
});
