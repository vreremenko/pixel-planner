/*
 * Синхронизация данных с аккаунтом на сервере. Работает, только пока вы вошли; без входа всё хранится
 * на устройстве. Запускает проходы при открытии, возвращении в приложение, появлении сети и после правок.
 */
import { create } from 'zustand';
import type { CreatingHookContext, IndexableType, UpdatingHookContext } from 'dexie';
import { db } from '../data/db';
import { metaRepo } from '../data/repo';
import { apiUrl } from '../apiBase';
import { clearSession, loadSession, type Session } from '../auth/session';
import { toast } from '../ui';
import { SYNCED_TABLES, syncOnce, type SyncState, type Transport, type WireRecord } from './core';

const META_KEY = 'sync';
/** Чьи данные лежат на этом устройстве (id аккаунта); нет записи — данные ничьи, их не синхронизировали. */
const OWNER_KEY = 'dataOwner';
const REQUEST_TIMEOUT_MS = 15_000;
/** Правку отправляем почти сразу: короткая пауза лишь склеивает быструю серию правок в один запрос. */
const DEBOUNCE_MS = 300;
/** Пока приложение открыто, спрашиваем сервер о новом так часто. */
const POLL_MS = 5_000;
/** После неудачи (нет сети, сервер не отвечает) пробуем снова через это время. */
const RETRY_MS = 8_000;
const KEEPALIVE_MAX_BYTES = 60_000;

interface SyncStore {
  /** Состояние синхронизации (null — не вошли; undefined — ещё не прочитали). */
  state: SyncState | null | undefined;
  running: boolean;
}

export const useSync = create<SyncStore>(() => ({ state: undefined, running: false }));

class SessionLost extends Error {}

async function loadState(): Promise<SyncState | null> {
  const raw = (await metaRepo.get<(SyncState & { key?: string }) | null>(META_KEY)) ?? null;
  // Состояние от прежней синхронизации по ключу (QR-код) больше не нужно: данные остаются на устройстве, нужен вход в аккаунт
  if (raw && (raw.key !== undefined || typeof raw.userId !== 'string')) {
    await db.meta.delete(META_KEY);
    useSync.setState({ state: null });
    return null;
  }
  useSync.setState({ state: raw });
  return raw;
}

async function saveState(s: SyncState | null): Promise<void> {
  if (s) await metaRepo.set(META_KEY, s);
  else await db.meta.delete(META_KEY);
  useSync.setState({ state: s });
}

async function request(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl(path), {
      ...init,
      signal: ctrl.signal,
      // keepalive: запрос дойдёт, даже если iOS усыпит приложение сразу после правки (лимит тела 64 КБ)
      ...(typeof init.body === 'string' && init.body.length < KEEPALIVE_MAX_BYTES ? { keepalive: true } : {}),
      headers: { authorization: `Bearer ${token}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
    });
    if (res.status === 401) throw new SessionLost('Сессия закончилась');
    if (!res.ok) throw new Error(`Сервер ответил HTTP ${String(res.status)}`);
    return res;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('Сервер не отвечает', { cause: e });
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function httpTransport(token: string): Transport {
  return {
    async pull(after) {
      const res = await request(token, `sync?after=${String(after)}`);
      return (await res.json()) as { records: WireRecord[]; cursor: number; more: boolean };
    },
    async push(records) {
      await request(token, 'sync', { method: 'PUT', body: JSON.stringify({ records }) });
    },
  };
}

/** Стереть с устройства задачи, привычки и награды (настройки остаются). */
async function wipeLocalData(): Promise<void> {
  await db.transaction('rw', [...SYNCED_TABLES.map((t) => db.table(t)), db.reminderLogs], async () => {
    for (const t of SYNCED_TABLES) await db.table(t).clear();
    await db.reminderLogs.clear();
  });
}

/** Записи, только что пришедшие с сервера, — обратно их не отправляем. */
const echo = new Map<string, number>();
let applying = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Один проход синхронизации. Если уже идёт — запомнит и повторит сразу после. */
async function syncNow(): Promise<void> {
  if (useSync.getState().running) {
    again = true;
    return;
  }
  const state = await loadState();
  const session = await loadSession();
  if (!state || !session || session.user.id !== state.userId) return;
  useSync.setState({ running: true });
  applying = true;
  try {
    let next: SyncState | null;
    try {
      next = (await syncOnce(db, state, httpTransport(session.token), echo)).state;
    } catch (e) {
      if (e instanceof SessionLost) {
        // Сервер больше не признаёт вход (прошёл год, сменили пароль на другом устройстве): данные остаются, нужен новый вход
        await clearSession();
        await saveState(null);
        toast('Сессия закончилась. Войдите в аккаунт снова.', 'alert', 'var(--c-warn)');
        return;
      }
      next = { ...state, lastError: e instanceof Error ? e.message : String(e) };
    }
    // Пока шёл проход, могли выйти из аккаунта
    const cur = await metaRepo.get<SyncState | null>(META_KEY);
    if (cur?.userId === state.userId) await saveState(next);
    if (next.lastError && cur?.userId === state.userId) schedule(RETRY_MS);
  } finally {
    applying = false;
    useSync.setState({ running: false });
  }
  if (again) {
    again = false;
    void syncNow();
  }
}

function schedule(ms = DEBOUNCE_MS): void {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), ms);
}

/**
 * Вошли в аккаунт: начинаем синхронизацию. Если на устройстве лежат данные другого аккаунта, их сначала стираем
 * (они остались на сервере у своего владельца). Данные, у которых владельца нет, переходят в этот аккаунт.
 */
export async function attachAccount(session: Session): Promise<void> {
  const owner = await metaRepo.get<string>(OWNER_KEY);
  if (owner && owner !== session.user.id) await wipeLocalData();
  await metaRepo.set(OWNER_KEY, session.user.id);
  await saveState({ userId: session.user.id, cursor: 0, pushedSince: 0 });
  void syncNow();
}

/** Вышли из аккаунта: синхронизация останавливается. С erase данные стираются с этого устройства. */
export async function detachAccount(erase: boolean): Promise<void> {
  clearTimeout(timer);
  await saveState(null);
  if (erase) {
    await wipeLocalData();
    await db.meta.delete(OWNER_KEY);
  }
}

/** Аккаунт удалён: данные остаются на устройстве, но больше никому не принадлежат. */
export async function forgetOwner(): Promise<void> {
  clearTimeout(timer);
  await saveState(null);
  await db.meta.delete(OWNER_KEY);
}

/** Запустить фоновую синхронизацию; возвращает функцию остановки. */
export function startSync(): () => void {
  const unsubs: (() => void)[] = [];
  const onChange = () => {
    if (!applying && useSync.getState().state) schedule();
  };
  const onCreating = function (this: CreatingHookContext<unknown, IndexableType>) {
    this.onsuccess = onChange;
  };
  const onUpdating = function (this: UpdatingHookContext<unknown, IndexableType>) {
    this.onsuccess = onChange;
    return undefined;
  };
  for (const t of SYNCED_TABLES) {
    db.table(t).hook('creating', onCreating);
    db.table(t).hook('updating', onUpdating);
  }
  unsubs.push(() => {
    for (const t of SYNCED_TABLES) {
      db.table(t).hook.creating.unsubscribe(onCreating);
      db.table(t).hook.updating.unsubscribe(onUpdating);
    }
  });
  // Вернулись в приложение — забираем новое сразу; уходим из него — отправляем свои правки немедленно
  const onVisible = () => {
    if (!useSync.getState().state) return;
    if (document.visibilityState === 'visible') void syncNow();
    else {
      clearTimeout(timer);
      void syncNow();
    }
  };
  const onWake = () => {
    if (useSync.getState().state) void syncNow();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onWake);
  window.addEventListener('focus', onWake);
  window.addEventListener('pageshow', onWake);
  unsubs.push(() => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onWake);
    window.removeEventListener('focus', onWake);
    window.removeEventListener('pageshow', onWake);
  });
  const poll = setInterval(() => {
    if (document.visibilityState === 'visible' && useSync.getState().state) void syncNow();
  }, POLL_MS);
  unsubs.push(() => clearInterval(poll));
  void loadState().then((s) => {
    if (s) void syncNow();
  });
  return () => {
    clearTimeout(timer);
    for (const u of unsubs) u();
  };
}
