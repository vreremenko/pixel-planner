/** Удалить service worker и офлайн-кэш (данные IndexedDB не трогаем) и перезагрузить. */
export async function resetAppCache(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    }
    if ('caches' in window) {
      for (const k of await caches.keys()) await caches.delete(k);
    }
  } finally {
    location.reload();
  }
}
