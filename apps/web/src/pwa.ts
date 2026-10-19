import { toast } from '@/stores/ui';

/** Register the service worker and surface an "update available" toast. */
export function registerPwa(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  void import('virtual:pwa-register').then(({ registerSW }) => {
    const update = registerSW({
      onNeedRefresh() {
        toast.info('A new version of Learn Chants is available.', {
          timeout: 0,
          action: { label: 'Update', onClick: () => void update(true) },
        });
      },
      onOfflineReady() {
        toast.info('Ready to work offline.');
      },
      onRegisteredSW(_url, reg) {
        // Check for updates hourly while the app is open.
        if (reg) setInterval(() => void reg.update(), 60 * 60 * 1000);
      },
    });
  });
}
