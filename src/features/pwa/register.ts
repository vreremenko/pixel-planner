import { registerSW } from 'virtual:pwa-register';
import { toast } from '../../ui';
import { initPwaListeners } from './pwaStore';

export function setupPwa() {
  initPwaListeners();
  // Без автоматической перезагрузки: новая версия service worker активируется сама
  // (skipWaiting) и подхватится при следующем запуске. Перезагрузки на iOS давали белый экран.
  registerSW({
    immediate: true,
    // Никаких автоматических перезагрузок страницы
    onNeedReload() {
      /* новая версия подхватится при следующем запуске */
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
