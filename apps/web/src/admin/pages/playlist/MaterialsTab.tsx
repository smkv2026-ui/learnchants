import { useRef, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { errorMessage } from '@/lib/errors';
import { deleteMedia, storeMedia } from '@/lib/media';
import { buildTree, flatten } from '@/lib/tree';
import { formatBytes } from '@/lib/format';
import type { Material } from '@/lib/types';
import { toast } from '@/stores/ui';
import { useMaterials, useNodes } from '@/hooks/useLearner';
import { Badge, Button, Card, EmptyState, Icon, IconButton, ListSkeleton, Modal, TextArea, TextField } from '@/components/ui';
import { UploadProgress } from '@/components/media/UploadProgress';

export function MaterialsTab({ pid }: { pid: string }) {
  const materials = useMaterials(pid);
  const nodes = useNodes(pid);
  const flat = flatten(buildTree(nodes.data));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', type: 'pdf' as Material['type'], nodeId: '', text: '' });
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const nodeName = (id?: string | null) => (id ? nodes.data.find((n) => n.id === id)?.name ?? 'Section' : 'Whole playlist');

  const needsFile = form.type !== 'text';
  const canSave = form.title.trim() && (needsFile ? !!file : form.text.trim());

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      const ref = await addDoc(collection(db, 'playlists', pid, 'materials'), {
        title: form.title.trim(),
        type: form.type,
        nodeId: form.nodeId || null,
        text: form.type === 'text' ? form.text.trim() : '',
        status: needsFile ? 'uploading' : 'ready',
        order: materials.data.length + 1,
        createdAt: serverTimestamp(),
      });
      if (needsFile && file) {
        setProgress(0);
        const mediaId = await storeMedia(file, { purpose: 'material', pid, fileName: file.name }, { onProgress: setProgress, nodeId: form.nodeId || null, useDrive: true });
        await updateDoc(ref, { mediaId, mimeType: file.type, sizeBytes: file.size, status: 'ready' });
      }
      toast.success('Material added');
      setOpen(false);
      setForm({ title: '', type: 'pdf', nodeId: '', text: '' });
      setFile(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">PDFs, scriptures and notes for the whole playlist or a specific section. Learners always see the list; files open once they have access.</p>
        <Button icon="plus" onClick={() => setOpen(true)}>Add material</Button>
      </div>
      {materials.loading ? (
        <ListSkeleton />
      ) : materials.data.length === 0 ? (
        <EmptyState art="scroll" title="No materials yet" message="Attach the chant text as PDF, a scripture reference, or a short description." />
      ) : (
        <ul className="space-y-2">
          {materials.data.map((m) => (
            <li key={m.id}>
              <Card className="flex items-center gap-3 p-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary"><Icon name={m.type === 'text' ? 'book' : 'file'} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.title}</p>
                  <p className="text-xs text-muted">{nodeName(m.nodeId)} · {m.type} {m.sizeBytes ? `· ${formatBytes(m.sizeBytes)}` : ''}</p>
                </div>
                {m.status === 'uploading' && <Badge tone="warn">uploading</Badge>}
                <IconButton icon="trash" label={`Delete ${m.title}`} size="sm" onClick={() => void deleteMedia(m.mediaId).then(() => deleteDoc(doc(db, 'playlists', pid, 'materials', m.id))).catch((e) => toast.error(errorMessage(e)))} />
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Add material"
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={busy} disabled={!canSave} onClick={() => void save()}>Save</Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextField label="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} maxLength={120} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="mat-type">Type</label>
              <select id="mat-type" className="input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as Material['type'] }))}>
                <option value="pdf">PDF</option>
                <option value="scripture">Scripture / material file</option>
                <option value="text">Description (text)</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="mat-node">Attach to</label>
              <select id="mat-node" className="input" value={form.nodeId} onChange={(e) => setForm((f) => ({ ...f, nodeId: e.target.value }))}>
                <option value="">Whole playlist</option>
                {flat.map((n) => (
                  <option key={n.id} value={n.id}>{'— '.repeat(n.depth)}{n.name}</option>
                ))}
              </select>
            </div>
          </div>
          {needsFile ? (
            <div>
              <Button variant="secondary" icon="upload" onClick={() => fileRef.current?.click()}>{file ? 'Change file' : 'Choose file'}</Button>
              {file && <span className="ml-3 text-sm text-muted">{file.name} · {formatBytes(file.size)}</span>}
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept={form.type === 'pdf' ? 'application/pdf' : 'application/pdf,image/*,text/plain,audio/*,video/*'}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f && !form.title) setForm((s) => ({ ...s, title: f.name.replace(/\.[^.]+$/, '') }));
                }}
              />
            </div>
          ) : (
            <TextArea label="Text" rows={6} value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))} maxLength={20000} />
          )}
          <UploadProgress value={progress} />
        </div>
      </Modal>
    </div>
  );
}
