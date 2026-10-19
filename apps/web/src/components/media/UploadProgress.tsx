import { ProgressBar } from '@/components/ui';

export function UploadProgress({ value, label = 'Uploading' }: { value: number | null; label?: string }) {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="flex justify-between text-xs text-muted">
        <span>{pct >= 100 ? 'Finishing…' : label}</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <ProgressBar value={pct} />
    </div>
  );
}
