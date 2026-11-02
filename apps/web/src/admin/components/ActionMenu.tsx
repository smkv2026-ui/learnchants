import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon, IconButton, cn, type IconName } from '@/components/ui';

export interface MenuAction {
  label: string;
  icon: IconName;
  onSelect: () => void;
  danger?: boolean;
}

/**
 * Overflow ("⋯") menu. The list is rendered in a portal with fixed positioning
 * so it is never clipped by a scrolling or collapsing container, follows its
 * button while the page scrolls, and opens upwards when there is no room below.
 */
export function ActionMenu({ label, actions, className }: { label: string; actions: MenuAction[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ right: number; top?: number; bottom?: number }>({ right: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const place = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const right = Math.max(8, window.innerWidth - r.right);
    const roomBelow = window.innerHeight - r.bottom;
    setPos(roomBelow < actions.length * 48 + 24 ? { right, bottom: window.innerHeight - r.top + 6 } : { right, top: r.bottom + 6 });
  };
  useEffect(() => {
    if (!open) return;
    place();
    const close = (e: Event) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !menu.current?.contains(t)) setOpen(false);
    };
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <div ref={ref} className={cn('relative', className)}>
      <IconButton icon="more" label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} />
      {createPortal(
        <AnimatePresence>
        {open && (
          <motion.ul
            ref={menu}
            role="menu"
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={pos}
            className="fixed z-[60] min-w-[200px] overflow-hidden rounded-2xl border border-white/10 bg-elevated p-1 shadow-2xl"
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
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
