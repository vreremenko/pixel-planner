/*
 * Планировщик напоминаний (этап А, без сервера).
 * Работает, только пока страница открыта или жива в фоне: раз в минуту и по точному
 * таймеру до ближайшего напоминания пересчитывает расписание и показывает уведомления.
 */
import { addDays, currentTimeZone, dateOf } from '../../domain/dates';
import { planReminders, summaryText, type PlannedReminder } from '../../domain/reminders';
import { isScheduled } from '../../domain/streaks';
import { buildOccurrences } from '../../domain/recurrence';
import {
  habitLogRepo,
  habitRepo,
  metaRepo,
  overrideRepo,
  reminderLogRepo,
  seriesRepo,
  settingsRepo,
  taskRepo,
} from '../../data/repo';
import { useSettings } from '../../stores/settings';
import { liveQuery } from 'dexie';
import { db } from '../../data/db';
import { toast } from '../../ui';
import { showSystemNotification } from './notify';
import { isPushActive, syncSchedule } from './push';
import { loadSession } from '../../auth/session';

const TICK_MS = 60_000;
/** Напоминание старше этого считается пропущенным (приложение было закрыто). */
const STALE_MS = 10 * 60_000;
/** Насколько далеко назад смотрим после долгого перерыва. */
const MAX_LOOKBACK_MS = 48 * 3_600_000;
const HORIZON_MS = 26 * 3_600_000;
/** На сколько вперёд отдаём расписание push-серверу (если приложение долго не открывать). */
/** Сколько ждём push от сервера, прежде чем показать напоминание самим: браузер мог его не получить. */
const PUSH_GRACE_MS = 15_000;
const PUSH_HORIZON_MS = 7 * 86_400_000;

let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;

async function plan(from: Date, to: Date): Promise<PlannedReminder[]> {
  const settings = await settingsRepo.get();
  const fromDate = addDays(dateOf(from), -1);
  const toDate = dateOf(to);
  const [tasks, series, overrides, habits, logs] = await Promise.all([
    taskRepo.byDateRange(fromDate, toDate),
    seriesRepo.all(),
    overrideRepo.all(),
    habitRepo.all(),
    habitLogRepo.byDateRange(fromDate, toDate),
  ]);
  // «Сегодня» = начало окна, чтобы экземпляры внутри окна были pending, а не missed.
  const occurrences = buildOccurrences(series, overrides, fromDate, toDate, fromDate);
  return planReminders({
    tasks,
    occurrences,
    habits,
    habitDone: new Set(logs.map((l) => `${l.habitId}:${l.date}`)),
    settings,
    from,
    to,
  });
}

async function summaryBody(date: string): Promise<string> {
  const [tasks, series, overrides, habits] = await Promise.all([
    taskRepo.byDate(date),
    seriesRepo.all(),
    overrideRepo.all(),
    habitRepo.all(),
  ]);
  const occ = buildOccurrences(series, overrides, date, date, date).filter((o) => o.status === 'pending');
  const h = habits.filter((x) => !x.archived && isScheduled(x.schedule, date));
  return summaryText(tasks.filter((t) => !t.done).length + occ.length, h.length);
}

async function fire(r: PlannedReminder, now: number, pushActive: boolean): Promise<void> {
  const stale = now - r.fireAt > STALE_MS;
  const body = r.kind === 'summary' ? await summaryBody(r.date) : r.body;
  // С push системное уведомление покажет service worker — здесь только отмечаем.
  let shown = pushActive;
  if (!stale && !pushActive) {
    shown = await showSystemNotification({ key: r.key, kind: r.kind, title: r.title, body });
    if (!shown && document.visibilityState === 'visible') {
      toast(`${r.title} — ${body}`, 'bell', 'var(--c-xp)');
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
    acknowledged: shown || r.kind === 'summary',
  });
}

/** Расписание уходит на сервер, пока мы вошли в аккаунт и напоминания включены: его получат и другие устройства аккаунта. */
async function shouldSendSchedule(): Promise<boolean> {
  return useSettings.getState().settings.notificationsEnabled && (await loadSession()) !== null;
}

/** Немедленно отправить расписание push-серверу (при сворачивании приложения). */
export async function flushPush(): Promise<void> {
  if (useSettings.getState().loaded && (await shouldSendSchedule())) await pushSchedule(Date.now());
}

async function pushSchedule(now: number): Promise<void> {
  try {
    const planned = await plan(new Date(now), new Date(now + PUSH_HORIZON_MS));
    const items = [];
    for (const r of planned) {
      items.push({
        key: r.key,
        fireAt: r.fireAt,
        kind: r.kind,
        ref: r.ref,
        date: r.date,
        title: r.title,
        body: r.kind === 'summary' ? await summaryBody(r.date) : r.body,
      });
    }
    await syncSchedule(items);
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
      if (settings.timeZone !== 'UTC') toast(`Часовой пояс: ${tz}. Напоминания пересчитаны.`, 'clock', 'var(--c-xp)');
    }
    const pushActive = await isPushActive();
    if (await shouldSendSchedule()) await pushSchedule(now);
    if (!settings.notificationsEnabled) return;

    const last = (await metaRepo.get<number>('lastReminderCheck')) ?? now;
    const from = new Date(Math.max(last, now - MAX_LOOKBACK_MS));
    const planned = await plan(from, new Date(now + HORIZON_MS));

    let waitingForPush = false;
    for (const r of planned) {
      if (r.fireAt > now) break;
      if (await reminderLogRepo.get(r.key)) continue;
      // Push пришёл — service worker запишет его в журнал. Не пришёл за PUSH_GRACE_MS — показываем сами
      if (pushActive && now - r.fireAt < PUSH_GRACE_MS) {
        waitingForPush = true;
        continue;
      }
      await fire(r, now, false);
    }
    // Отложенные: показать повторно
    for (const log of await reminderLogRepo.snoozed(0)) {
      if (log.snoozedUntil === undefined || log.snoozedUntil > now) continue;
      const { snoozedUntil: _s, ...rest } = log;
      await reminderLogRepo.put({ ...rest, firedAt: now });
      if (!pushActive) await showSystemNotification({ key: log.key, kind: log.kind, title: `⏰ ${log.title}`, body: log.body });
    }
    if (!waitingForPush) await metaRepo.set('lastReminderCheck', now);

    const snoozes = (await reminderLogRepo.snoozed(now)).map((l) => l.snoozedUntil ?? Infinity);
    const next = Math.min(...planned.filter((r) => r.fireAt > now).map((r) => r.fireAt), ...snoozes);
    schedule(waitingForPush ? 3000 : Math.min(TICK_MS, Math.max(1000, next - Date.now() + 250)));
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
  // Любое изменение задач/повторов/привычек — пересчитать расписание сразу
  let first = true;
  const sub = liveQuery(() =>
    Promise.all([
      db.tasks.orderBy('updatedAt').last(),
      db.series.orderBy('updatedAt').last(),
      db.overrides.orderBy('updatedAt').last(),
      db.habits.orderBy('updatedAt').last(),
      db.habitLogs.orderBy('updatedAt').last(),
      db.reminderLogs.orderBy('updatedAt').last(),
    ]),
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
