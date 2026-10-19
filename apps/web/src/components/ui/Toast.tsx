import { AnimatePresence, motion } from 'framer-motion';
import { useUi } from '@/stores/ui';
import { Icon } from './Icon';
import { cn } from './cn';

export function Toaster() {
  const { toasts, dismiss } = useUi();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-elevated/95 p-3.5 pr-2 shadow-2xl backdrop-blur',
              t.kind === 'error' ? 'border-danger/40' : t.kind === 'success' ? 'border-success/40' : 'border-primary/30',
            )}
          >
            <Icon
              name={t.kind === 'error' ? 'alert' : t.kind === 'success' ? 'check' : 'info'}
              className={cn('mt-0.5 shrink-0', t.kind === 'error' ? 'text-danger' : t.kind === 'success' ? 'text-success' : 'text-primary')}
            />
            <p className="flex-1 text-sm">{t.message}</p>
            {t.action && (
              <button
                className="rounded-lg px-2 py-1 text-sm font-semibold text-primary hover:bg-primary/10"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button aria-label="Dismiss" className="rounded-lg p-1 text-muted hover:text-ink" onClick={() => dismiss(t.id)}>
              <Icon name="x" size={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
