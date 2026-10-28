import { create } from 'zustand';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  deferred: BeforeInstallPromptEvent | null;
  installed: boolean;
  updateReady: boolean;
  update: (() => void) | null;
}

export const usePwa = create<PwaState>(() => ({
  deferred: null,
  installed: typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches,
  updateReady: false,
  update: null,
}));

export function initPwaListeners() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    usePwa.setState({ deferred: e as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => usePwa.setState({ installed: true, deferred: null }));
}
