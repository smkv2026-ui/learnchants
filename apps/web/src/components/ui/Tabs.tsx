import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from './cn';
import { Icon, type IconName } from './Icon';

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  icon?: IconName;
  badge?: number;
}

/** Accessible tabs (roving tabindex, arrow keys) with an animated pill. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
  stretch,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  stretch?: boolean;
}) {
  const group = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, idx: number) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (idx + delta + items.length) % items.length;
    refs.current[next]?.focus();
    onChange(items[next].id);
  };
  return (
    <div role="tablist" className={cn('glass inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl p-1', stretch && 'flex w-full', className)}>
      {items.map((t, i) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => (refs.current[i] = el)}
            role="tab"
            id={`${group}-${t.id}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onChange(t.id)}
            className={cn(
              'relative flex min-h-[40px] items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition',
              stretch && 'flex-1',
              active ? 'text-maroon-900' : 'text-muted hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId={`tab-pill-${group}`}
                className="absolute inset-0 rounded-xl bg-gold-sheen shadow-glow"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative flex items-center gap-2">
              {t.icon && <Icon name={t.icon} size={16} />}
              {t.label}
              {!!t.badge && (
                <span className="rounded-full bg-danger px-1.5 text-[11px] font-bold leading-5 text-white">{t.badge}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
