import type { NodeDoc, WithId } from './types';

export interface TreeNode extends WithId<NodeDoc> {
  children: TreeNode[];
  depth: number;
}

export function byOrder<T extends { order?: number; name?: string; title?: string }>(a: T, b: T): number {
  return (a.order ?? 0) - (b.order ?? 0) || (a.name ?? a.title ?? '').localeCompare(b.name ?? b.title ?? '');
}

export function buildTree(nodes: WithId<NodeDoc>[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  nodes.forEach((n) => map.set(n.id, { ...n, children: [], depth: 0 }));
  const roots: TreeNode[] = [];
  map.forEach((n) => {
    const parent = n.parentId ? map.get(n.parentId) : undefined;
    if (parent) parent.children.push(n);
    else roots.push(n);
  });
  const sortRec = (list: TreeNode[], depth: number) => {
    list.sort(byOrder);
    list.forEach((n) => {
      n.depth = depth;
      sortRec(n.children, depth + 1);
    });
  };
  sortRec(roots, 0);
  return roots;
}

/** Ancestors from the root down to (and including) ``id``. */
export function pathTo(nodes: WithId<NodeDoc>[], id: string | null | undefined): WithId<NodeDoc>[] {
  const map = new Map(nodes.map((n) => [n.id, n]));
  const out: WithId<NodeDoc>[] = [];
  const seen = new Set<string>();
  let cur = id ? map.get(id) : undefined;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift(cur);
    cur = cur.parentId ? map.get(cur.parentId) : undefined;
  }
  return out;
}

export function descendants(nodes: WithId<NodeDoc>[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) {
      if (n.parentId && out.has(n.parentId) && !out.has(n.id)) {
        out.add(n.id);
        grew = true;
      }
    }
  }
  return out;
}

export function flatten(tree: TreeNode[]): TreeNode[] {
  return tree.flatMap((n) => [n, ...flatten(n.children)]);
}

/** Reassign ``order`` after a drag: returns [id, newOrder] pairs that changed. */
export function reorder<T extends { id: string; order?: number }>(items: T[], fromId: string, toId: string): [string, number][] {
  const list = [...items];
  const from = list.findIndex((i) => i.id === fromId);
  const to = list.findIndex((i) => i.id === toId);
  if (from < 0 || to < 0 || from === to) return [];
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  return list.flatMap((item, idx) => ((item.order ?? -1) !== idx + 1 ? [[item.id, idx + 1] as [string, number]] : []));
}
