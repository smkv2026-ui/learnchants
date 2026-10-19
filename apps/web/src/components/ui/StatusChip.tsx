import { Badge } from './Badge';
import { Icon } from './Icon';

export type VerseState = 'NOT_STARTED' | 'SUBMITTED' | 'NEEDS_WORK' | 'APPROVED' | 'LOCKED';

const MAP: Record<VerseState, { label: string; tone: 'neutral' | 'indigo' | 'warn' | 'success'; icon?: 'check' | 'clock' | 'refresh' | 'lock' }> = {
  NOT_STARTED: { label: 'Not started', tone: 'neutral' },
  SUBMITTED: { label: 'Submitted', tone: 'indigo', icon: 'clock' },
  NEEDS_WORK: { label: 'Needs work', tone: 'warn', icon: 'refresh' },
  APPROVED: { label: 'Approved', tone: 'success', icon: 'check' },
  LOCKED: { label: 'Locked', tone: 'neutral', icon: 'lock' },
};

export function StatusChip({ status }: { status: VerseState }) {
  const s = MAP[status];
  return (
    <Badge tone={s.tone}>
      {s.icon && <Icon name={s.icon} size={12} />}
      {s.label}
    </Badge>
  );
}
