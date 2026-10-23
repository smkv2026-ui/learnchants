import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, deleteDoc, doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { AnimatePresence, motion } from 'framer-motion';
import { auth, db } from '@/lib/firebase';
import { deleteVerseMedia } from '@/lib/media';
import { renameEntityFolders } from '@/lib/media/drive';
import { recountVerses } from '@/lib/ops/content';
import { errorMessage } from '@/lib/errors';
import { buildTree, byOrder, descendants, reorder, type TreeNode } from '@/lib/tree';
import type { NodeDoc, Verse, WithId } from '@/lib/types';
import { toast } from '@/stores/ui';
import { useNodes, useVerses } from '@/hooks/useLearner';
import { Badge, Button, Card, EmptyState, Icon, IconButton, ListSkeleton, Modal, TextField, cn } from '@/components/ui';
import { ActionMenu } from '../../components/ActionMenu';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { SortableList } from '../../components/SortableList';

interface Ctx {
  pid: string;
  nodes: WithId<NodeDoc>[];
  verses: WithId<Verse>[];
  expanded: Set<string>;
  toggle: (id: string) => void;
  onAdd: (parentId: string | null) => void;
  onMove: (node: WithId<NodeDoc>) => void;
  onDelete: (node: WithId<NodeDoc>) => void;
  onDeleteVerse: (verse: WithId<Verse>) => void;
}

async function saveOrder(pid: string, sub: 'nodes' | 'verses', items: { id: string; order?: number }[], from: string, to: string) {
  const changes = reorder(items, from, to);
  if (!changes.length) return;
  const batch = writeBatch(db);
  changes.forEach(([id, order]) => batch.update(doc(db, 'playlists', pid, sub, id), { order }));
  await batch.commit().catch((e) => toast.error(errorMessage(e)));
}

function InlineName({ pid, node }: { pid: string; node: WithId<NodeDoc> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(node.name);
  const commit = async () => {
    setEditing(false);
    const name = value.trim();
    if (!name || name === node.name) return setValue(node.name);
    await updateDoc(doc(db, 'playlists', pid, 'nodes', node.id), { name, updatedAt: serverTimestamp() }).catch((e) => toast.error(errorMessage(e)));
    // Keep the mirrored Drive folder name in sync (when Drive is connected).
    const uid = auth.currentUser?.uid;
    if (uid) await renameEntityFolders(uid, `n:${node.id}`, name).catch(() => undefined);
  };
  if (editing) {
    return (
      <input
        autoFocus
        aria-label="Section name"
        className="input !py-1.5"
        value={value}
        maxLength={100}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void commit();
          if (e.key === 'Escape') {
            setValue(node.name);
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <button className="truncate text-left font-semibold hover:text-primary" onClick={() => setEditing(true)} title="Click to rename">
      {node.name}
    </button>
  );
}

function VerseRows({ ctx, nodeId }: { ctx: Ctx; nodeId: string }) {
  const items = ctx.verses.filter((v) => v.nodeId === nodeId).sort(byOrder);
  if (!items.length) return null;
  return (
    <SortableList
      items={items}
      onReorder={(a, b) => void saveOrder(ctx.pid, 'verses', items, a, b)}
      className="space-y-1.5"
      render={(v, handle) => (
        <div className="flex items-center gap-2 rounded-xl bg-ink/[.04] py-1.5 pl-1 pr-2">
          {handle}
          <Icon name="music" size={16} className="text-primary" />
          <Link to={`/admin/playlists/${ctx.pid}/verses/${v.id}`} className="min-w-0 flex-1 truncate text-sm hover:text-primary">
            {v.name}
          </Link>
          {v.hasAudio ? <Badge tone="success">audio</Badge> : <Badge tone="warn">no audio</Badge>}
          {v.hasVideo && <Badge tone="indigo">video</Badge>}
          <IconButton icon="trash" label={`Delete verse ${v.name}`} size="sm" onClick={() => ctx.onDeleteVerse(v)} />
        </div>
      )}
    />
  );
}

function NodeItem({ node, ctx, handle }: { node: TreeNode; ctx: Ctx; handle: ReactNode }) {
  const navigate = useNavigate();
  const open = ctx.expanded.has(node.id);
  const verseCount = ctx.verses.filter((v) => v.nodeId === node.id).length;
  return (
    <div className={cn('rounded-2xl', node.depth === 0 ? 'glass p-2' : 'border-l-2 border-primary/20 pl-2')}>
      <div className="flex items-center gap-1.5">
        {handle}
        <IconButton
          icon={open ? 'chevron-down' : 'chevron-right'}
          label={open ? 'Collapse' : 'Expand'}
          size="sm"
          onClick={() => ctx.toggle(node.id)}
        />
        <div className="min-w-0 flex-1">
          <InlineName pid={ctx.pid} node={node} />
          <p className="text-xs text-muted">
            {node.children.length ? `${node.children.length} sub-sections · ` : ''}
            {node.verseCount ?? 0} verses total
          </p>
        </div>
        <div className="hidden shrink-0 items-center sm:flex">
          <IconButton icon="plus" label="Add sub-section" size="sm" onClick={() => ctx.onAdd(node.id)} />
          <Button size="sm" variant="ghost" icon="music" onClick={() => navigate(`/admin/playlists/${ctx.pid}/verses/new?node=${node.id}`)}>
            Add verse
          </Button>
          <IconButton icon="external" label="Move to another parent" size="sm" onClick={() => ctx.onMove(node)} />
          <IconButton icon="trash" label="Delete section" size="sm" onClick={() => ctx.onDelete(node)} />
        </div>
        <ActionMenu
          className="shrink-0 sm:hidden"
          label={`Actions for ${node.name}`}
          actions={[
            { label: 'Add verse', icon: 'music', onSelect: () => navigate(`/admin/playlists/${ctx.pid}/verses/new?node=${node.id}`) },
            { label: 'Add sub-section', icon: 'plus', onSelect: () => ctx.onAdd(node.id) },
            { label: 'Move…', icon: 'external', onSelect: () => ctx.onMove(node) },
            { label: 'Delete', icon: 'trash', onSelect: () => ctx.onDelete(node), danger: true },
          ]}
        />
      </div>
      <AnimatePresence initial={false}>
        {open && (node.children.length > 0 || verseCount > 0) && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-2 py-2 pl-2 sm:pl-6">
              <NodeList ctx={ctx} items={node.children} />
              <VerseRows ctx={ctx} nodeId={node.id} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NodeList({ ctx, items }: { ctx: Ctx; items: TreeNode[] }) {
  if (!items.length) return null;
  return (
    <SortableList
      items={items}
      onReorder={(a, b) => void saveOrder(ctx.pid, 'nodes', items, a, b)}
      className="space-y-2"
      render={(n, handle) => <NodeItem node={n} ctx={ctx} handle={handle} />}
    />
  );
}

export function StructureTab({ pid }: { pid: string }) {
  const nodes = useNodes(pid);
  const verses = useVerses(pid);
  const tree = useMemo(() => buildTree(nodes.data), [nodes.data]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [addParent, setAddParent] = useState<string | null | undefined>(undefined);
  const [moving, setMoving] = useState<WithId<NodeDoc> | null>(null);
  const [deleting, setDeleting] = useState<WithId<NodeDoc> | null>(null);
  const [deletingVerse, setDeletingVerse] = useState<WithId<Verse> | null>(null);
  const [name, setName] = useState('');
  const [bulk, setBulk] = useState({ on: false, prefix: 'Anuvakam', count: '11' });
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const addNodes = async () => {
    if (addParent === undefined) return;
    const siblings = nodes.data.filter((n) => (n.parentId ?? null) === addParent);
    const start = siblings.reduce((m, n) => Math.max(m, n.order ?? 0), 0);
    const names = bulk.on
      ? Array.from({ length: Math.min(200, Math.max(1, Number(bulk.count) || 0)) }, (_, i) => `${bulk.prefix.trim() || 'Section'} ${i + 1}`)
      : [name.trim()];
    if (!names[0]) return;
    setBusy(true);
    try {
      const batch = writeBatch(db);
      names.forEach((n, i) =>
        batch.set(doc(collection(db, 'playlists', pid, 'nodes')), {
          parentId: addParent,
          name: n,
          description: '',
          order: start + i + 1,
          verseCount: 0,
          createdAt: serverTimestamp(),
        }),
      );
      await batch.commit();
      if (addParent) setExpanded((s) => new Set(s).add(addParent));
      setAddParent(undefined);
      setName('');
      toast.success(names.length > 1 ? `Added ${names.length} sections` : 'Section added');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const ctx: Ctx = {
    pid,
    nodes: nodes.data,
    verses: verses.data,
    expanded,
    toggle,
    onAdd: (p) => {
      setBulk((b) => ({ ...b, on: false }));
      setAddParent(p);
    },
    onMove: setMoving,
    onDelete: setDeleting,
    onDeleteVerse: setDeletingVerse,
  };

  const step1 = nodes.data.length > 0;
  const step2 = verses.data.length > 0;

  return (
    <div className="space-y-6">
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        {[
          { done: step1, title: '1 · Build the classification tree', text: 'e.g. Namakam / Chamakam → Anuvakam 1–11' },
          { done: step2, title: '2 · Add verses to the sections', text: 'Record or attach audio & video for each verse' },
        ].map((s) => (
          <div key={s.title} className="flex flex-1 items-center gap-3">
            <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full', s.done ? 'bg-success/20 text-success' : 'bg-primary/15 text-primary')}>
              <Icon name={s.done ? 'check' : 'chevron-right'} size={18} />
            </span>
            <div>
              <p className="font-semibold">{s.title}</p>
              <p className="text-xs text-muted">{s.text}</p>
            </div>
          </div>
        ))}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button icon="plus" onClick={() => ctx.onAdd(null)}>Add top-level section</Button>
        {nodes.data.length > 0 && (
          <Button variant="ghost" size="md" onClick={() => setExpanded(expanded.size ? new Set() : new Set(nodes.data.map((n) => n.id)))}>
            {expanded.size ? 'Collapse all' : 'Expand all'}
          </Button>
        )}
      </div>

      {nodes.loading ? (
        <ListSkeleton />
      ) : tree.length === 0 ? (
        <EmptyState title="Start with the structure" message="Add top-level sections such as “Namakam” and “Chamakam”, then add sub-sections like “Anuvakam 1–11”." art="scroll" />
      ) : (
        <NodeList ctx={ctx} items={tree} />
      )}

      <Modal
        open={addParent !== undefined}
        onClose={() => setAddParent(undefined)}
        title={addParent ? `Add under “${nodes.data.find((n) => n.id === addParent)?.name}”` : 'Add top-level section'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddParent(undefined)}>Cancel</Button>
            <Button loading={busy} onClick={() => void addNodes()} disabled={bulk.on ? !(Number(bulk.count) > 0) : !name.trim()}>
              Add
            </Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void addNodes(); }}>
          {!bulk.on ? (
            <TextField label="Name" placeholder="Namakam" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={100} />
          ) : (
            <div className="grid grid-cols-[2fr_1fr] gap-3">
              <TextField label="Name prefix" value={bulk.prefix} onChange={(e) => setBulk((b) => ({ ...b, prefix: e.target.value }))} />
              <TextField label="How many" type="number" min={1} max={200} value={bulk.count} onChange={(e) => setBulk((b) => ({ ...b, count: e.target.value }))} />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={bulk.on} onChange={(e) => setBulk((b) => ({ ...b, on: e.target.checked }))} className="h-4 w-4 accent-[rgb(var(--primary))]" />
            Add several numbered sections at once (e.g. Anuvakam 1–11)
          </label>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deletingVerse}
        onClose={() => setDeletingVerse(null)}
        danger
        title={`Delete “${deletingVerse?.name}”?`}
        confirmLabel="Delete"
        message="This deletes the verse with its audio and video."
        onConfirm={async () => {
          if (!deletingVerse) return;
          try {
            await deleteVerseMedia(pid, deletingVerse.id).catch(() => undefined);
            await deleteDoc(doc(db, 'playlists', pid, 'verses', deletingVerse.id));
            await recountVerses(pid).catch(() => undefined);
            toast.success('Verse deleted');
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />

      <MoveDialog pid={pid} node={moving} nodes={nodes.data} onClose={() => setMoving(null)} />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        danger
        title={`Delete “${deleting?.name}”?`}
        confirmLabel="Delete"
        message="This deletes the section, all its sub-sections and their verses. Verse media is moved to the Drive trash."
        onConfirm={async () => {
          if (!deleting) return;
          const ids = descendants(nodes.data, deleting.id);
          for (const v of verses.data.filter((v) => ids.has(v.nodeId))) await deleteVerseMedia(pid, v.id).catch(() => undefined);
          const batch = writeBatch(db);
          verses.data.filter((v) => ids.has(v.nodeId)).forEach((v) => batch.delete(doc(db, 'playlists', pid, 'verses', v.id)));
          ids.forEach((id) => batch.delete(doc(db, 'playlists', pid, 'nodes', id)));
          await batch.commit().catch((e) => toast.error(errorMessage(e)));
          await recountVerses(pid).catch(() => undefined);
        }}
      />
    </div>
  );
}

function MoveDialog({ pid, node, nodes, onClose }: { pid: string; node: WithId<NodeDoc> | null; nodes: WithId<NodeDoc>[]; onClose: () => void }) {
  const [target, setTarget] = useState<string>('');
  if (!node) return null;
  const blocked = descendants(nodes, node.id);
  const options = nodes.filter((n) => !blocked.has(n.id));
  return (
    <Modal
      open
      onClose={onClose}
      title={`Move “${node.name}”`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={async () => {
              const parentId = target || null;
              const order = nodes.filter((n) => (n.parentId ?? null) === parentId).reduce((m, n) => Math.max(m, n.order ?? 0), 0) + 1;
              await updateDoc(doc(db, 'playlists', pid, 'nodes', node.id), { parentId, order }).catch((e) => toast.error(errorMessage(e)));
              await recountVerses(pid).catch(() => undefined);
              onClose();
            }}
          >
            Move
          </Button>
        </>
      }
    >
      <label className="label" htmlFor="move-target">New parent</label>
      <select id="move-target" className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="">(Top level)</option>
        {options.sort(byOrder).map((n) => (
          <option key={n.id} value={n.id}>{n.name}</option>
        ))}
      </select>
    </Modal>
  );
}
