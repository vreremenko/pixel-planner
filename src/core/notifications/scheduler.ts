/*
 * Планировщик напоминаний (этап А, без сервера).
 * Работает, только пока страница открыта или жива в фоне: раз в минуту и по точному
 * таймеру до ближайшего напоминания пересчитывает расписание и показывает уведомления.
 */
import { currentTimeZone } from '../domain/dates';
import { metaRepo, reminderLogRepo } from '../data/repo';
import { INFO_KIND, type PlannedReminder } from './types';
import { planAll as plan } from '../../modules/reminders';
import { SYNC_TABLES } from '../../shared/syncTables';
import { useSettings } from '../stores/settings';
import { liveQuery } from 'dexie';
import { db } from '../data/db';
import { toast } from '../ui';
import { showSystemNotification } from './notify';
import { isPushActive, syncSchedule } from './push';
import { loadSession } from '../auth/session';

const TICK_MS = 60_000;
/** Напоминание старше этого считается пропущенным (приложение было закрыто). */
const STALE_MS = 10 * 60_000;
/** Насколько далеко назад смотрим после долгого перерыва. */
const MAX_LOOKBACK_MS = 48 * 3_600_000;
const HORIZON_MS = 26 * 3_600_000;
/** На сколько вперёд отдаём расписание push-серверу (если приложение долго не открывать). */
const PUSH_HORIZON_MS = 7 * 86_400_000;

let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;

async function fire(r: PlannedReminder, now: number, pushActive: boolean): Promise<void> {
  const stale = now - r.fireAt > STALE_MS;
  const { body } = r;
  // С push системное уведомление покажет service worker — здесь только отмечаем.
  let shown = pushActive;
  if (!stale && !pushActive) {
    shown = await showSystemNotification({ key: r.key, kind: r.kind, title: r.title, body });
    if (!shown && document.visibilityState === 'visible') {
      toast(`${r.title} — ${body}`, 'bell', 'var(--c-gold)');
      shown = true;
    }
  }
  await reminderLogRepo.put({
    id: r.key,
    key: r.key,
    kind: r.kind,
    ref: r.ref,
    date: r.date,
    title: r.title,
    body,
    fireAt: r.fireAt,
    createdAt: now,
    updatedAt: now,
    ...(shown ? { firedAt: now } : {}),
    // Не показанные (приложение было закрыто) попадут в «пропущенные»; сводку не копим.
    acknowledged: shown || r.kind === INFO_KIND,
  });
}

/** Расписание уходит на сервер, пока мы вошли в аккаунт и напоминания включены: его получат и другие устройства аккаунта. */
async function shouldSendSchedule(): Promise<boolean> {
  return useSettings.getState().settings.notificationsEnabled && (await loadSession()) !== null;
}

/** Немедленно отправить расписание push-серверу (при сворачивании приложения). */
async function flushPush(): Promise<void> {
  if (useSettings.getState().loaded && (await shouldSendSchedule())) await pushSchedule(Date.now());
}

async function pushSchedule(now: number): Promise<void> {
  try {
    const planned = await plan(new Date(now), new Date(now + PUSH_HORIZON_MS));
    await syncSchedule(planned.map(({ key, fireAt, kind, ref, date, title, body }) => ({ key, fireAt, kind, ref, date, title, body })));
  } catch {
    // Нет сети — отправим при следующем тике
  }
}

export async function tick(): Promise<void> {
  if (running || !useSettings.getState().loaded) return;
  running = true;
  try {
    const now = Date.now();
    // Смена часового пояса: пересчёт идёт автоматически, сообщаем пользователю.
    const tz = currentTimeZone();
    const { settings, update } = useSettings.getState();
    if (settings.timeZone !== tz) {
      await update({ timeZone: tz });
      if (settings.timeZone !== 'UTC') toast(`Часовой пояс: ${tz}. Напоминания пересчитаны.`, 'clock', 'var(--c-gold)');
    }
    const pushActive = await isPushActive();
    if (await shouldSendSchedule()) await pushSchedule(now);
    if (!settings.notificationsEnabled) return;

    const last = (await metaRepo.get<number>('lastReminderCheck')) ?? now;
    const from = new Date(Math.max(last, now - MAX_LOOKBACK_MS));
    const planned = await plan(from, new Date(now + HORIZON_MS));

    for (const r of planned) {
      if (r.fireAt > now) break;
      if (await reminderLogRepo.get(r.key)) continue;
      await fire(r, now, pushActive);
    }
    // Отложенные: показать повторно
    for (const log of await reminderLogRepo.snoozed(0)) {
      if (log.snoozedUntil === undefined || log.snoozedUntil > now) continue;
      const { snoozedUntil: _s, ...rest } = log;
      await reminderLogRepo.put({ ...rest, firedAt: now });
      if (!pushActive) await showSystemNotification({ key: log.key, kind: log.kind, title: `⏰ ${log.title}`, body: log.body });
    }
    await metaRepo.set('lastReminderCheck', now);

    const snoozes = (await reminderLogRepo.snoozed(now)).map((l) => l.snoozedUntil ?? Infinity);
    const next = Math.min(...planned.filter((r) => r.fireAt > now).map((r) => r.fireAt), ...snoozes);
    schedule(Math.min(TICK_MS, Math.max(1000, next - Date.now() + 250)));
    return;
  } finally {
    running = false;
  }
}

function schedule(ms: number) {
  clearTimeout(timer);
  timer = setTimeout(() => void tick(), ms);
}

/** Запуск планировщика. Возвращает функцию остановки. */
export function startNotifications(): () => void {
  const onVisible = () => {
    // При сворачивании — сразу отправить расписание, не дожидаясь очереди тика
    if (document.visibilityState === 'hidden') void flushPush();
    else void tick();
  };
  const onPageHide = () => void flushPush();
  window.addEventListener('pagehide', onPageHide);
  const onMessage = (e: MessageEvent<{ type?: string }>) => {
    if (e.data.type === 'reminders-changed') void tick();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null;
  sw?.addEventListener('message', onMessage);
  schedule(TICK_MS);
  void tick();
  // Перепланирование при изменении настроек
  const unsub = useSettings.subscribe((s, prev) => {
    if (s.settings !== prev.settings) void tick();
  });
  // Любое изменение данных разделов — пересчитать расписание сразу
  let first = true;
  const sub = liveQuery(() =>
    Promise.all([...SYNC_TABLES.map((t) => db.table(t).orderBy('updatedAt').last()), db.reminderLogs.orderBy('updatedAt').last()]),
  ).subscribe(() => {
    if (first) first = false;
    else void tick();
  });
  return () => {
    clearTimeout(timer);
    unsub();
    sub.unsubscribe();
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
    window.removeEventListener('pagehide', onPageHide);
    sw?.removeEventListener('message', onMessage);
  };
}
