/// <reference lib="webworker" />
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { clientsClaim } from 'workbox-core';
import { metaRepo, reminderLogRepo } from '../data/repo';
import type { ReminderLog } from '../domain/types';
import { apiUrl } from '../apiBase';
import { completeFromReminder, snoozeReminder, SNOOZE_MS } from '../data/quickActions';

declare const self: ServiceWorkerGlobalScope;

// Офлайн: всё приложение (JS, CSS, шрифты, иконки) в precache
// Автообновление: новая версия активируется сразу и забирает открытые вкладки
void self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
// Навигация (в т.ч. запуск установленного приложения): сначала сеть, кэш — только офлайн.
// Так iOS всегда получает свежую страницу, а ответ без редиректов.
async function cleanCopy(r: Response): Promise<Response> {
  return new Response(await r.blob(), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

registerRoute(
  new NavigationRoute(async ({ request }) => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(request.url, { signal: ctrl.signal, cache: 'no-store', credentials: 'same-origin' });
      clearTimeout(timer);
      if (res.ok) return res.redirected ? await cleanCopy(res) : res;
    } catch {
      // нет сети или таймаут — ниже отдадим из кэша
    }
    const cached = await matchPrecache('index.html');
    if (cached) return await cleanCopy(cached);
    return fetch(request.url);
  }),
);

self.addEventListener('message', (e: ExtendableMessageEvent) => {
  if ((e.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});

async function notifyClients() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of clients) c.postMessage({ type: 'reminders-changed' });
  return clients;
}

async function focusOrOpen() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const client = clients[0];
  if (client) return client.focus();
  return self.clients.openWindow(self.registration.scope);
}

interface PushData {
  key: string;
  kind: ReminderLog['kind'];
  ref: string;
  date: string;
  title: string;
  body: string;
  fireAt: number;
}

const ICON = new URL('icons/icon-192.png', self.registration.scope).href;

type NotifData = Pick<ReminderLog, 'key' | 'kind' | 'ref' | 'date' | 'title' | 'body'>;

function showReminder(title: string, body: string, key: string, kind: ReminderLog['kind'], extra?: NotifData) {
  return self.registration.showNotification(title, {
    body,
    tag: key,
    icon: ICON,
    badge: ICON,
    // Всё нужное для кнопок — прямо в уведомлении, без опоры на базу
    data: extra ?? { key },
    // Кнопки действий (Chrome/Android/Edge; Safari их не показывает)
    ...({ actions: kind === 'summary' ? [] : [
      { action: 'done', title: '✔ Выполнено' },
      { action: 'snooze', title: '⏰ Отложить 10 мин' },
    ] } as object),
  });
}

// Этап Б: push от сервера — показываем даже при закрытом приложении
self.addEventListener('push', (event: PushEvent) => {
  let d: PushData;
  try {
    d = event.data?.json() as PushData;
  } catch {
    return;
  }
  // iOS требует показать уведомление на каждый push. Показываем СРАЗУ:
  // на заблокированном iPhone IndexedDB может быть недоступна, и ожидание базы
  // перед показом теряло уведомление.
  const now = Date.now();
  const shown = showReminder(d.title, d.body, d.key, d.kind, {
    key: d.key, kind: d.kind, ref: d.ref, date: d.date, title: d.title, body: d.body,
  });
  // Отметка «показано» — по возможности и не дольше 3 секунд
  const logged = Promise.race([
    reminderLogRepo.put({
      id: d.key, key: d.key, kind: d.kind, ref: d.ref, date: d.date, title: d.title, body: d.body,
      fireAt: d.fireAt, firedAt: now, createdAt: now, updatedAt: now, acknowledged: true,
    }),
    new Promise((r) => setTimeout(r, 3000)),
  ]).catch(() => undefined);
  event.waitUntil(Promise.all([shown, logged]));
});

async function snoozeViaServer(log: ReminderLog): Promise<boolean> {
  const push = await metaRepo.get<{ deviceId: string; enabled: boolean }>('push');
  if (!push?.enabled) return false;
  const res = await fetch(apiUrl(`devices/${push.deviceId}/snooze`), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key: log.key, kind: log.kind, ref: log.ref, date: log.date, title: `⏰ ${log.title}`, body: log.body, fireAt: Date.now() + SNOOZE_MS }),
  }).catch(() => null);
  return res?.ok === true;
}

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  const nd = event.notification.data as Partial<NotifData> | null;
  const key = nd?.key;
  event.notification.close();
  event.waitUntil(
    (async () => {
      const stored = key ? await reminderLogRepo.get(key).catch(() => undefined) : undefined;
      const log: ReminderLog | undefined =
        stored ??
        (nd?.key && nd.kind && nd.ref !== undefined && nd.date !== undefined
          ? {
              id: nd.key, key: nd.key, kind: nd.kind, ref: nd.ref, date: nd.date, title: nd.title ?? '', body: nd.body ?? '',
              fireAt: Date.now(), createdAt: Date.now(), updatedAt: Date.now(), acknowledged: true,
            }
          : undefined);
      if (event.action === 'done' && log) {
        // У счётной привычки нужно число — открываем приложение вместо отметки
        if (!(await completeFromReminder(log))) {
          await focusOrOpen();
          return;
        }
        await reminderLogRepo.acknowledge([log.key]);
        await notifyClients();
        return;
      }
      if (event.action === 'snooze' && log) {
        // С push-сервером повтор придёт надёжно, даже если всё закрыто
        if (await snoozeViaServer(log)) {
          await reminderLogRepo.acknowledge([log.key]);
          return;
        }
        await snoozeReminder(log.key);
        const clients = await notifyClients();
        // Если окна нет — пробуем показать сами. Браузер может усыпить worker раньше:
        // тогда напоминание покажется при следующем открытии приложения.
        if (clients.length === 0) {
          await new Promise((r) => setTimeout(r, SNOOZE_MS));
          await showReminder(`⏰ ${log.title}`, log.body, log.key, log.kind);
          const cur = await reminderLogRepo.get(log.key);
          if (cur) {
            const { snoozedUntil: _s, ...rest } = cur;
            await reminderLogRepo.put({ ...rest, firedAt: Date.now() });
          }
        }
        return;
      }
      await focusOrOpen();
    })(),
  );
});
