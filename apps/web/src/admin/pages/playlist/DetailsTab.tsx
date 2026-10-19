import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { deleteMedia } from '@/lib/media';
import { errorMessage } from '@/lib/errors';
import { isValidUpiId } from '@/lib/upi';
import type { PaymentInfo, Playlist, WithId } from '@/lib/types';
import { toast } from '@/stores/ui';
import { useDoc } from '@/hooks/useFirestore';
import { Button, Card, Icon, Switch, TextArea, TextField, cn } from '@/components/ui';
import { CoverArt } from '@/components/learner/PlaylistCard';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { imageToDataUrl } from '@/lib/image';

export function DetailsTab({ pid, playlist }: { pid: string; playlist: WithId<Playlist> }) {
  const navigate = useNavigate();
  const payment = useDoc<PaymentInfo>(doc(db, 'playlists', pid, 'payment', 'info'));
  const [form, setForm] = useState({
    title: playlist.title,
    titleNative: playlist.titleNative ?? '',
    description: playlist.description ?? '',
    access: playlist.access,
    price: playlist.price ? String(playlist.price) : '',
    published: playlist.published,
    sequentialUnlock: !!playlist.sequentialUnlock,
  });
  const [upi, setUpi] = useState({ upiId: '', payeeName: '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (payment.data) setUpi({ upiId: payment.data.upiId, payeeName: payment.data.payeeName });
  }, [payment.data]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const paid = form.access === 'paid';
  const priceNum = Number(form.price);
  const errors = {
    title: !form.title.trim() ? 'Title is required' : '',
    price: paid && (!priceNum || priceNum < 1 || priceNum > 100000) ? 'Enter a price between ₹1 and ₹1,00,000' : '',
    upiId: paid && !isValidUpiId(upi.upiId) ? 'Enter a valid UPI ID (name@bank)' : '',
    payeeName: paid && !upi.payeeName.trim() ? 'Payee name is required' : '',
  };
  const valid = !Object.values(errors).some(Boolean);

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'playlists', pid), {
        title: form.title.trim(),
        titleNative: form.titleNative.trim(),
        description: form.description.trim(),
        access: form.access,
        price: paid ? priceNum : null,
        published: form.published,
        sequentialUnlock: form.sequentialUnlock,
        updatedAt: serverTimestamp(),
      });
      if (paid) await setDoc(doc(db, 'playlists', pid, 'payment', 'info'), { upiId: upi.upiId.trim(), payeeName: upi.payeeName.trim() });
      toast.success('Playlist saved');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const uploadCover = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast.error('Please choose an image.');
    setUploading(true);
    try {
      await updateDoc(doc(db, 'playlists', pid), { coverUrl: await imageToDataUrl(f), updatedAt: serverTimestamp() });
      toast.success('Cover updated');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    // Remove stored media (Firestore chunks / Drive files) first, then the content docs.
    const batch = writeBatch(db);
    for (const sub of ['verses', 'nodes', 'materials', 'payment']) {
      const snap = await getDocs(collection(db, 'playlists', pid, sub));
      for (const d of snap.docs) {
        for (const key of ['audioMediaId', 'videoMediaId', 'mediaId']) await deleteMedia(d.data()[key]).catch(() => undefined);
        batch.delete(d.ref);
      }
    }
    batch.delete(doc(db, 'playlists', pid));
    await batch.commit();
    await deleteDoc(doc(db, 'adminPlaylists', pid)).catch(() => undefined);
    toast.success('Playlist deleted');
    navigate('/admin/playlists');
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
      <Card className="space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Title" value={form.title} onChange={(e) => set('title', e.target.value)} error={errors.title} maxLength={100} />
          <TextField label="Title in script (optional)" lang="sa" className="font-chant" placeholder="श्री रुद्रम्" value={form.titleNative} onChange={(e) => set('titleNative', e.target.value)} maxLength={100} />
        </div>
        <TextArea label="Description of meaning" rows={5} value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={4000} hint="Shown to everyone, including before purchase." />

        <fieldset>
          <legend className="label">Access</legend>
          <div className="grid grid-cols-2 gap-3">
            {(['free', 'paid'] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => set('access', a)}
                aria-pressed={form.access === a}
                className={cn('glass rounded-2xl p-4 text-left transition', form.access === a && 'border-primary/60 shadow-glow')}
              >
                <p className="font-semibold">{a === 'free' ? 'Free' : 'Paid (UPI)'}</p>
                <p className="text-xs text-muted">{a === 'free' ? 'Anyone signed in can learn.' : 'Unlocked after you approve a payment.'}</p>
              </button>
            ))}
          </div>
        </fieldset>

        {paid && (
          <div className="space-y-4 rounded-2xl bg-primary/5 p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField label="Price (INR)" type="number" min={1} inputMode="numeric" value={form.price} onChange={(e) => set('price', e.target.value)} error={errors.price} />
              <TextField label="UPI ID" placeholder="trust@okhdfcbank" value={upi.upiId} onChange={(e) => setUpi((u) => ({ ...u, upiId: e.target.value }))} error={errors.upiId} />
              <TextField label="Payee name" value={upi.payeeName} onChange={(e) => setUpi((u) => ({ ...u, payeeName: e.target.value }))} error={errors.payeeName} />
            </div>
            <p className="flex gap-2 text-sm text-warn">
              <Icon name="info" size={18} className="mt-0.5 shrink-0" />
              The UPI ID and payee name are visible to anyone who pays. A neutral organisation or trust UPI ID keeps personal details private.
            </p>
          </div>
        )}

        <Switch checked={form.sequentialUnlock} onChange={(v) => set('sequentialUnlock', v)} label="Sequential unlocking" description="Each verse unlocks only after the previous one is approved." />
        <Switch checked={form.published} onChange={(v) => set('published', v)} label="Published" description="Drafts are visible only to admins." />

        <div className="flex flex-wrap gap-3 border-t hairline pt-5">
          <Button icon="check" onClick={() => void save()} loading={saving} disabled={!valid}>Save changes</Button>
          <Button variant="ghost" icon="trash" className="ml-auto text-danger" onClick={() => setConfirmDelete(true)}>Delete playlist</Button>
        </div>
      </Card>

      <Card className="h-fit p-5">
        <p className="label">Cover image</p>
        <div className="aspect-[16/10] overflow-hidden rounded-2xl">
          <CoverArt playlist={playlist} />
        </div>
        <Button className="mt-3" variant="secondary" icon="upload" block loading={uploading} onClick={() => file.current?.click()}>
          {playlist.coverUrl ? 'Replace cover' : 'Upload cover'}
        </Button>
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => void uploadCover(e.target.files?.[0])} />
        <p className="mt-2 text-xs text-muted">Compressed to a small WebP and stored with the playlist (public).</p>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        danger
        title="Delete playlist?"
        confirmLabel="Delete forever"
        message="This removes the playlist, its sections, verses and materials. Verse media files are moved to the Drive trash. Learner submissions remain in Drive."
        onConfirm={remove}
      />
    </div>
  );
}
