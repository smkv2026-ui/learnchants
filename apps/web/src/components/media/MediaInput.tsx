import { useRef, useState } from 'react';
import type { MediaKind } from '@/lib/recorder';
import { formatBytes, formatDuration } from '@/lib/format';
import { readDuration } from '@/lib/media';
import { Button, Icon, Tabs } from '@/components/ui';
import { Recorder, type Recording } from './Recorder';


/** "Record or Attach file" input used by the admin verse form and reply composer. */
export function MediaInput({
  kind,
  value,
  onChange,
  hasExisting,
  maxBytes,
}: {
  kind: MediaKind;
  value: Recording | null;
  onChange: (rec: Recording | null) => void;
  hasExisting?: boolean;
  maxBytes?: number;
}) {
  const [mode, setMode] = useState<'record' | 'attach'>('record');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const onFile = async (file: File | undefined) => {
    setError('');
    if (!file) return;
    if (!file.type.startsWith(`${kind}/`) && !(kind === 'audio' && file.type === 'video/webm')) {
      setError(`Please choose an ${kind} file.`);
      return;
    }
    if (maxBytes && file.size > maxBytes) {
      setError(`File is too large (max ${formatBytes(maxBytes)}).`);
      return;
    }
    const durationSec = (await readDuration(file)) ?? 0;
    onChange({ blob: file, mimeType: file.type, durationSec, url: URL.createObjectURL(file), fileName: file.name });
  };

  if (value) {
    return (
      <div className="glass rounded-3xl p-4">
        <div className="mb-3 flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2 font-medium">
            <Icon name="check" className="text-success" size={18} />
            {value.fileName ?? `New ${kind} recording`} · {formatDuration(value.durationSec)} · {formatBytes(value.blob.size)}
          </span>
          <Button size="sm" variant="ghost" icon="x" onClick={() => onChange(null)}>
            Remove
          </Button>
        </div>
        {kind === 'audio' ? (
          <audio src={value.url} controls className="w-full" />
        ) : (
          <video src={value.url} controls playsInline className="aspect-video w-full rounded-2xl bg-black" />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Tabs
        items={[
          { id: 'record', label: 'Record', icon: kind === 'audio' ? 'mic' : 'video' },
          { id: 'attach', label: 'Attach file', icon: 'upload' },
        ]}
        value={mode}
        onChange={setMode}
      />
      {hasExisting && <p className="text-xs text-muted">A {kind} file is already saved. Adding a new one replaces it.</p>}
      {mode === 'record' ? (
        <Recorder kind={kind} onConfirm={(rec) => onChange(rec)} />
      ) : (
        <div
          className="glass flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-primary/30 p-8 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void onFile(e.dataTransfer.files?.[0]);
          }}
        >
          <Icon name="upload" size={32} className="text-primary" />
          <p className="text-sm text-muted">Drag & drop an {kind} file here, or</p>
          <Button variant="outline" onClick={() => input.current?.click()}>
            Choose {kind} file
          </Button>
          <input ref={input} type="file" accept={`${kind}/*`} className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
