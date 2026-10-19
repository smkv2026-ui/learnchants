import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { usePwa } from '@/stores/pwa';
import { Button, Icon, IconButton } from '@/components/ui';

export function OfflineBanner() {
  const online = usePwa((s) => s.online);
  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: 'auto' }}
          exit={{ height: 0 }}
          className="overflow-hidden bg-warn/15 text-center text-sm"
          role="status"
        >
          <p className="flex items-center justify-center gap-2 px-4 py-2">
            <Icon name="wifi-off" size={16} /> You're offline. Saved content is still available; recordings will need a connection.
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function InstallBanner() {
  const { installEvent, installed, install } = usePwa();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('lc-install-dismissed') === '1';
    } catch {
      return false;
    }
  });
  if (!installEvent || installed || dismissed) return null;
  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="glass fixed inset-x-3 bottom-24 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl p-3 shadow-2xl sm:bottom-6"
    >
      <img src="/icons/icon-192.png" alt="" className="h-11 w-11 rounded-xl" />
      <div className="flex-1 text-sm">
        <p className="font-semibold">Install Learn Chants</p>
        <p className="text-muted">Practise anytime, even offline.</p>
      </div>
      <Button size="sm" onClick={() => void install()}>
        Install
      </Button>
      <IconButton
        icon="x"
        label="Dismiss"
        size="sm"
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem('lc-install-dismissed', '1');
          } catch {
            /* ignore */
          }
        }}
      />
    </motion.div>
  );
}
