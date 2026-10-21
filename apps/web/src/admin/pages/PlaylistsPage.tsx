import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, doc, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { errorMessage } from '@/lib/errors';
import { deletePlaylist } from '@/lib/ops/content';
import { reorder } from '@/lib/tree';
import { formatInr } from '@/lib/upi';
import type { Playlist, WithId } from '@/lib/types';
import { useAuth } from '@/stores/auth';
import { toast } from '@/stores/ui';
import { useCollection } from '@/hooks/useFirestore';
import { Badge, Button, EmptyState, Icon, ListSkeleton, Modal, TextField } from '@/components/ui';
import { CoverArt } from '@/components/learner/PlaylistCard';
import { AdminHeader } from '../components/AdminLayout';
import { SortableList } from '../components/SortableList';
import { ConfirmDialog } from '../components/ConfirmDialog';

export default function PlaylistsPage() {
  const uid = useAuth((s) => s.user?.uid);
  const navigate = useNavigate();
  const playlists = useCollection<Playlist>(query(collection(db, 'playlists'), orderBy('order', 'asc')), 'admin-playlists');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<WithId<Playlist> | null>(null);

  const create = async () => {
    if (!uid || !title.trim()) return;
    setBusy(true);
    try {
      const ref = doc(collection(db, 'playlists'));
      const batch = writeBatch(db);
      batch.set(ref, {
        title: title.trim(),
        description: '',
        coverUrl: null,
        access: 'free',
        price: null,
        published: false,
        sequentialUnlock: false,
        order: playlists.data.length + 1,
        verseCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      // Ownership lives only in the admin-only collection (anonymity).
      batch.set(doc(db, 'adminPlaylists', ref.id), { ownerUid: uid, createdBy: uid, createdAt: serverTimestamp() });
      await batch.commit();
      setOpen(false);
      setTitle('');
      navigate(`/admin/playlists/${ref.id}?tab=structure`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onReorder = async (from: string, to: string) => {
    const changes = reorder(playlists.data, from, to);
    const batch = writeBatch(db);
    changes.forEach(([id, order]) => batch.update(doc(db, 'playlists', id), { order }));
    await batch.commit().catch((e) => toast.error(errorMessage(e)));
  };

  const remove = async (p: WithId<Playlist>) => {
    try {
      await deletePlaylist(p.id);
      toast.success(`“${p.title}” deleted`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <AdminHeader
        title="Playlists"
        subtitle="Build the classification first (e.g. Namakam → Anuvakam 1–11), then add verses."
        actions={<Button icon="plus" onClick={() => setOpen(true)}>New playlist</Button>}
      />
      {playlists.loading ? (
        <ListSkeleton />
      ) : playlists.data.length === 0 ? (
        <EmptyState title="Create your first playlist" message="For example “Sri Rudram”." action={<Button icon="plus" onClick={() => setOpen(true)}>New playlist</Button>} />
      ) : (
        <SortableList
          items={playlists.data}
          onReorder={(a, b) => void onReorder(a, b)}
          className="space-y-2.5"
          render={(p, handle) => (
            <div className="glass flex items-center gap-3 rounded-2xl p-3">
              {handle}
              <div className="h-14 w-20 shrink-0 overflow-hidden rounded-xl">
                <CoverArt playlist={p} />
              </div>
              <Link to={`/admin/playlists/${p.id}`} className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold hover:text-primary">{p.title}</p>
                <p className="text-xs text-muted">{p.verseCount ?? 0} verses</p>
              </Link>
              <div className="hidden flex-wrap gap-2 sm:flex">
                {p.published ? <Badge tone="success">Published</Badge> : <Badge>Draft</Badge>}
                {p.access === 'paid' ? <Badge tone="gold">{formatInr(p.price)}</Badge> : <Badge tone="indigo">Free</Badge>}
              </div>
              <Link to={`/admin/playlists/${p.id}`} aria-label={`Edit ${p.title}`} className="rounded-lg p-2 text-muted hover:bg-ink/5 hover:text-ink">
                <Icon name="edit" />
              </Link>
              <button
                type="button"
                onClick={() => setToDelete(p)}
                aria-label={`Delete ${p.title}`}
                className="rounded-lg p-2 text-muted hover:bg-red-500/10 hover:text-red-500"
              >
                <Icon name="trash" />
              </button>
            </div>
          )}
        />
      )}
      <ConfirmDialog
        open={toDelete != null}
        onClose={() => setToDelete(null)}
        danger
        title="Delete playlist?"
        confirmLabel="Delete forever"
        message={
          <>
            This removes <strong className="text-ink">{toDelete?.title}</strong> with all its sections, verses, materials and their audio/video.
            Learner recordings and progress are kept. This can't be undone.
          </>
        }
        onConfirm={() => (toDelete ? remove(toDelete) : undefined)}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New playlist"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void create()} loading={busy} disabled={!title.trim()}>Create</Button>
          </>
        }
      >
        <form onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <TextField label="Title" placeholder="Sri Rudram" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={100} />
          <p className="mt-3 text-sm text-muted">The playlist starts as a draft. You'll build its sections and verses next.</p>
        </form>
      </Modal>
    </>
  );
}
