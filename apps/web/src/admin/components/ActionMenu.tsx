import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon, IconButton, cn, type IconName } from '@/components/ui';

export interface MenuAction {
  label: string;
  icon: IconName;
  onSelect: () => void;
  danger?: boolean;
}

/** Overflow ("⋯") menu used on phones where a row has no room for several icon buttons. */
export function ActionMenu({ label, actions, className }: { label: string; actions: MenuAction[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div ref={ref} className={cn('relative', className)}>
      <IconButton icon="more" label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} />
      <AnimatePresence>
        {open && (
          <motion.ul
            role="menu"
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute right-0 top-12 z-40 min-w-[200px] overflow-hidden rounded-2xl border border-white/10 bg-elevated p-1 shadow-2xl"
          >
            {actions.map((a) => (
              <li key={a.label} role="none">
                <button
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    a.onSelect();
                  }}
                  className={cn('flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-left text-sm hover:bg-ink/5', a.danger && 'text-danger')}
                >
                  <Icon name={a.icon} size={18} />
                  {a.label}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
