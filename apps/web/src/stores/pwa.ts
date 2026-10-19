import { create } from 'zustand';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  installEvent: BeforeInstallPromptEvent | null;
  installed: boolean;
  online: boolean;
  install: () => Promise<boolean>;
}

export const usePwa = create<PwaState>((set, get) => ({
  installEvent: null,
  installed: typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  install: async () => {
    const ev = get().installEvent;
    if (!ev) return false;
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    set({ installEvent: null, installed: outcome === 'accepted' });
    return outcome === 'accepted';
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    usePwa.setState({ installEvent: e as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => usePwa.setState({ installed: true, installEvent: null }));
  window.addEventListener('online', () => usePwa.setState({ online: true }));
  window.addEventListener('offline', () => usePwa.setState({ online: false }));
}
