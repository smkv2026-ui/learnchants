import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import type { Material, WithId } from '@/lib/types';
import { toast } from '@/stores/ui';
import { Badge, Icon, Modal } from '@/components/ui';

export function MaterialsList({ items, canOpen }: { items: WithId<Material>[]; canOpen: boolean }) {
  const [textItem, setTextItem] = useState<WithId<Material> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!items.length) return null;

  const open = async (m: WithId<Material>) => {
    if (m.type === 'text' || (!m.mediaId && m.text)) {
      setTextItem(m);
      return;
    }
    if (!m.mediaId) return;
    if (!canOpen) {
      toast.info('Unlock this playlist to open its materials.');
      return;
    }
    setBusy(m.id);
    // Open the tab synchronously (popup blockers), then point it at the signed URL.
    const win = window.open('', '_blank');
    if (win) win.opener = null;
    try {
      const { url } = await api.getMediaUrl({ mediaId: m.mediaId });
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch (err) {
      win?.close();
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="materials-h" className="mt-6">
      <h2 id="materials-h" className="mb-3 text-xl font-semibold">Study materials</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((m) => (
          <li key={m.id}>
            <button
              onClick={() => void open(m)}
              className="glass flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-ink/5"
              disabled={busy === m.id || m.status === 'uploading'}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                <Icon name={m.type === 'text' ? 'book' : 'file'} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{m.title}</span>
                <span className="text-xs text-muted">
                  {m.type === 'pdf' ? 'PDF' : m.type === 'scripture' ? 'Scripture' : 'Notes'} {m.sizeBytes ? `· ${formatBytes(m.sizeBytes)}` : ''}
                </span>
              </span>
              {m.mediaId && !canOpen ? <Badge><Icon name="lock" size={12} /></Badge> : <Icon name="chevron-right" size={16} className="text-muted" />}
            </button>
          </li>
        ))}
      </ul>
      <Modal open={!!textItem} onClose={() => setTextItem(null)} title={textItem?.title}>
        <p className="whitespace-pre-wrap leading-relaxed">{textItem?.text}</p>
      </Modal>
    </section>
  );
}
