import { registerSW } from 'virtual:pwa-register';
import { toast } from '../ui';
import { initPwaListeners } from './pwaStore';
import { startUpdateChecks } from './updateCheck';

export function setupPwa() {
  initPwaListeners();
  startUpdateChecks();
  // Новая версия service worker активируется сама (skipWaiting). Страницу перезагружает updateCheck
  // при запуске и возврате в приложение — один раз на версию, чтобы не зациклиться.
  registerSW({
    immediate: true,
    // Перезагрузкой занимается updateCheck, а не плагин
    onNeedReload() {
      /* см. updateCheck.ts */
    },
    onRegisteredSW(_url, reg) {
      // Проверять обновления при возврате в приложение и раз в час
      if (!reg) return;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update();
      });
      setInterval(() => void reg.update(), 3_600_000);
    },
    onOfflineReady() {
      toast('Готово к работе офлайн', 'check', 'var(--c-habit)');
    },
  });
}
