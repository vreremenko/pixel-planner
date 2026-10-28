import { usePwa } from './pwaStore';

export function useInstallPrompt() {
  const { deferred, installed, updateReady, update } = usePwa();
  return {
    canInstall: deferred !== null,
    installed,
    updateReady,
    applyUpdate: () => update?.(),
    prompt: async () => {
      if (!deferred) return;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      usePwa.setState({ deferred: null, installed: outcome === 'accepted' });
    },
  };
}
