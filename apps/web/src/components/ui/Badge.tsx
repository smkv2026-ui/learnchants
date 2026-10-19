import type { ReactNode } from 'react';
import { cn } from './cn';

type Tone = 'gold' | 'neutral' | 'success' | 'danger' | 'warn' | 'indigo' | 'maroon';

const tones: Record<Tone, string> = {
  gold: 'bg-primary/15 text-primary ring-primary/30',
  neutral: 'bg-ink/5 text-muted ring-ink/10',
  success: 'bg-success/15 text-success ring-success/30',
  danger: 'bg-danger/15 text-danger ring-danger/30',
  warn: 'bg-warn/15 text-warn ring-warn/30',
  indigo: 'bg-indigo-400/15 text-indigo-400 ring-indigo-400/30',
  maroon: 'bg-accent/15 text-accent ring-accent/30',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', tones[tone], className)}>
      {children}
    </span>
  );
}
