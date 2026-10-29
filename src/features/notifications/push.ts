/*
 * Этап Б: Web Push. Устройство подписывается через PushManager, а на сервер уходит
 * только расписание напоминаний на ближайшие дни (ключ, момент, текст) — не вся база.
 * Сервер по расписанию присылает push, даже когда приложение закрыто.
 */
import { metaRepo } from '../../data/repo';
import type { PlannedReminder } from '../../domain/reminders';
import { apiUrl as api } from '../../apiBase';

export interface PushState {
  deviceId: string;
  enabled: boolean;
}

export interface ScheduleItem {
  key: string;
  fireAt: number;
  kind: PlannedReminder['kind'];
  ref: string;
  date: string;
  title: string;
  body: string;
}


export async function getPushState(): Promise<PushState | undefined> {
  return metaRepo.get<PushState>('push');
}

export async function isPushActive(): Promise<boolean> {
  return (await getPushState())?.enabled === true;
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

export const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Почему push сейчас нельзя включить (null — можно). */
export function pushUnavailableReason(serverOk: boolean | null): string | null {
  if (isIos() && !isStandalone()) return 'На iPhone push работает только в установленном приложении: Safari → «Поделиться» → «На экран „Домой“», затем откройте его с иконки.';
  if (!pushSupported()) return 'Этот браузер не поддерживает push-уведомления.';
  if (serverOk === null) return 'Проверяем сервер…';
  if (!serverOk) return 'Push-сервер недоступен (нет сети или это локальная версия).';
  return null;
}

/** Попросить сервер прислать тестовый push прямо сейчас. */
export async function testPush(): Promise<string> {
  const st = await getPushState();
  if (!st?.enabled) return 'Push не включён на этом устройстве';
  const res = await fetch(api(`devices/${st.deviceId}/test`), { method: 'POST' });
  if (res.status === 404) return 'Сервер не знает это устройство — выключите и снова включите push';
  const r = (await res.json()) as { ok: boolean; status: number; detail: string; service: string };
  return r.ok ? `Отправлено через ${r.service} — уведомление должно появиться` : `Push-сервис ${r.service} ответил ${String(r.status)}: ${r.detail || 'без подробностей'}`;
}

/** Ключ VAPID с сервера; null — сервера нет (локальная разработка или статичный хостинг). */
export async function getServerKey(): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(api('config'), { signal: ctrl.signal });
    if (!res.ok) return null;
    const cfg = (await res.json()) as { vapidPublicKey?: string; push?: boolean };
    return cfg.push && cfg.vapidPublicKey ? cfg.vapidPublicKey : null;
  } catch {
    return null;
  }
}

function urlB64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function step<T>(label: string, p: Promise<T>, ms = 15_000): Promise<T> {
  return Promise.race([
    p.catch((e: unknown) => {
      throw new Error(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label}: нет ответа`)), ms)),
  ]);
}

/**
 * Включить push. Вызывать прямо из обработчика нажатия: Safari разрешает
 * pushManager.subscribe() только в ответ на действие пользователя, поэтому
 * ключ сервера загружается заранее, а подписка — первый вызов после нажатия.
 */
export async function enablePush(serverKey?: string): Promise<void> {
  const key = serverKey ?? (await step('Ключ сервера', getServerKey()));
  if (!key) throw new Error('Push-сервер недоступен');
  const reg = await step('Service worker', navigator.serviceWorker.ready);
  const sub = await step(
    'Подписка в браузере',
    reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(key) }),
  );
  const deviceId = (await getPushState())?.deviceId ?? crypto.randomUUID();
  const res = await step(
    'Регистрация на сервере',
    fetch(api(`devices/${deviceId}`), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    }),
  );
  if (!res.ok) throw new Error(`Регистрация на сервере: HTTP ${String(res.status)}`);
  await metaRepo.set('push', { deviceId, enabled: true } satisfies PushState);
  lastSent = '';
}

export async function disablePush(): Promise<void> {
  const st = await getPushState();
  try {
    const reg = await navigator.serviceWorker.ready;
    await (await reg.pushManager.getSubscription())?.unsubscribe();
    if (st) await fetch(api(`devices/${st.deviceId}`), { method: 'DELETE' });
  } finally {
    if (st) await metaRepo.set('push', { ...st, enabled: false } satisfies PushState);
  }
}

let lastSent = '';

/** Следующая синхронизация отправит расписание, даже если оно не менялось. */
export function forceNextSync(): void {
  lastSent = '';
}

/** Результат последней отправки расписания (показывается в настройках). */
export interface SyncStatus {
  at: number;
  ok: boolean;
  count: number;
  error?: string;
}

async function putSchedule(url: string, body: string): Promise<Response> {
  // keepalive: iOS не обрывает запрос, если приложение свернули или заблокировали телефон.
  // У keepalive лимит тела 64 КБ — для большого расписания идём обычным запросом.
  const init: RequestInit = { method: 'PUT', headers: { 'content-type': 'application/json' }, body };
  if (body.length < 60_000) {
    try {
      return await fetch(url, { ...init, keepalive: true });
    } catch {
      // некоторые браузеры отвергают keepalive — пробуем без него
    }
  }
  return fetch(url, init);
}

/** Отправить расписание на сервер (если не изменилось — ничего не делает). */
export async function syncSchedule(items: ScheduleItem[], force = false): Promise<void> {
  const st = await getPushState();
  if (!st?.enabled) return;
  const body = JSON.stringify({ items });
  if (body === lastSent && !force) return;
  try {
    const res = await putSchedule(api(`devices/${st.deviceId}/schedule`), body);
    if (res.status === 404) {
      // Сервер забыл устройство (подписка истекла) — переподписываемся
      await enablePush();
      return;
    }
    if (res.ok) lastSent = body;
    await metaRepo.set('pushSync', {
      at: Date.now(), ok: res.ok, count: items.length, ...(res.ok ? {} : { error: `HTTP ${String(res.status)}` }),
    } satisfies SyncStatus);
  } catch (e) {
    await metaRepo.set('pushSync', {
      at: Date.now(), ok: false, count: items.length, error: e instanceof Error ? e.message : String(e),
    } satisfies SyncStatus);
    throw e;
  }
}
