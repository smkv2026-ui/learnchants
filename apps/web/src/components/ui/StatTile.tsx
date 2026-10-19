import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card } from './Card';
import { Icon, type IconName } from './Icon';
import { cn } from './cn';

/** Compact KPI tile: stacked on phones, icon beside the number from `sm` up. */
export function StatTile({ icon, label, value, tone = 'bg-primary/15 text-primary', to }: { icon: IconName; label: string; value: ReactNode; tone?: string; to?: string }) {
  const body = (
    <Card className={cn('flex h-full flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5', to && 'transition hover:-translate-y-0.5 hover:shadow-glow')}>
      <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl sm:h-12 sm:w-12 sm:rounded-2xl', tone)}>
        <Icon name={icon} size={20} />
      </span>
      <div className="min-w-0">
        <p className="num text-3xl font-bold leading-none sm:text-4xl">{value}</p>
        <p className="mt-1 text-[11px] font-medium uppercase leading-tight tracking-wider text-muted sm:text-xs">{label}</p>
      </div>
    </Card>
  );
  return to ? <Link to={to} className="block h-full rounded-3xl">{body}</Link> : body;
}
