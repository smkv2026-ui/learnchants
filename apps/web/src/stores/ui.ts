import { create } from 'zustand';

export type Theme = 'dark' | 'light';
export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; onClick: () => void };
  timeout?: number;
}

interface UiState {
  theme: Theme;
  toasts: Toast[];
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  toast: (message: string, kind?: ToastKind, extra?: Partial<Toast>) => number;
  dismiss: (id: number) => void;
}

const initialTheme = (): Theme =>
  (typeof document !== 'undefined' && (document.documentElement.dataset.theme as Theme)) || 'dark';

let nextId = 1;

export const useUi = create<UiState>((set, get) => ({
  theme: initialTheme(),
  toasts: [],
  setTheme: (theme) => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#4a0d1c' : '#fff8ee');
    try {
      localStorage.setItem('lc-theme', theme);
    } catch {
      /* private mode */
    }
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  toast: (message, kind = 'info', extra = {}) => {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, kind, message, ...extra }] });
    const timeout = extra.timeout ?? (kind === 'error' ? 6000 : 3500);
    if (timeout > 0) setTimeout(() => get().dismiss(id), timeout);
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  success: (m: string) => useUi.getState().toast(m, 'success'),
  error: (m: string) => useUi.getState().toast(m, 'error'),
  info: (m: string, extra?: Partial<Toast>) => useUi.getState().toast(m, 'info', extra),
};
