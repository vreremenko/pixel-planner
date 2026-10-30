export interface NotifyPayload {
  key: string;
  kind: 'task' | 'occurrence' | 'habit' | 'summary';
  title: string;
  body: string;
}

const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

export function permission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

/** Запрос разрешения — вызывать только из обработчика действия пользователя. */
export async function requestPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.requestPermission();
}

async function swRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined;
  // ready не резолвится без service worker — ограничиваем ожидание
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<undefined>((r) => setTimeout(() => r(undefined), 3000)),
  ]);
}

/** Показ через service worker (там работают кнопки действий), иначе — простой Notification. */
export async function showSystemNotification(p: NotifyPayload): Promise<boolean> {
  if (permission() !== 'granted') return false;
  const icon = `${import.meta.env.BASE_URL}icons/icon-192.png`;
  const actions = p.kind === 'summary' ? [] : [
    { action: 'done', title: '✔ Выполнено' },
    { action: 'snooze', title: '⏰ Отложить 10 мин' },
  ];
  try {
    const reg = await swRegistration();
    if (reg) {
      await reg.showNotification(p.title, {
        body: p.body,
        tag: p.key,
        icon,
        badge: icon,
        data: { key: p.key },
        // actions поддерживаются не везде; в типах DOM их может не быть
        ...({ actions } as object),
      });
      return true;
    }
    new Notification(p.title, { body: p.body, tag: p.key, icon });
    return true;
  } catch {
    return false;
  }
}
