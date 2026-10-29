/*
 * Синхронизация в приложении: хранит ключ, ходит на сервер и запускает проходы
 * при открытии, возвращении в приложение, появлении сети и после правок.
 */
import { create } from 'zustand';
import type { CreatingHookContext, IndexableType, UpdatingHookContext } from 'dexie';
import { db } from '../data/db';
import { metaRepo } from '../data/repo';
import { apiUrl } from '../apiBase';
import { generateKey, SYNCED_TABLES, syncOnce, type SyncState, type Transport, type WireRecord } from './core';

const META_KEY = 'sync';
const REQUEST_TIMEOUT_MS = 25_000;
const DEBOUNCE_MS = 3_000;
const POLL_MS = 60_000;

interface SyncStore {
  /** Включена ли синхронизация на этом устройстве (null — ещё не прочитали). */
  state: SyncState | null | undefined;
  running: boolean;
}

export const useSync = create<SyncStore>(() => ({ state: undefined, running: false }));

async function loadState(): Promise<SyncState | null> {
  const s = (await metaRepo.get<SyncState | null>(META_KEY)) ?? null;
  useSync.setState({ state: s });
  return s;
}

async function saveState(s: SyncState | null): Promise<void> {
  if (s) await metaRepo.set(META_KEY, s);
  else await db.meta.delete(META_KEY);
  useSync.setState({ state: s });
}

async function request(key: string, path: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl(path), {
      ...init,
      signal: ctrl.signal,
      headers: { authorization: `Bearer ${key}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
    });
    if (res.status === 401) throw new Error('Сервер не принял ключ синхронизации');
    if (!res.ok) throw new Error(`Сервер ответил HTTP ${String(res.status)}`);
    return res;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('Сервер не отвечает', { cause: e });
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function httpTransport(key: string): Transport {
  return {
    async pull(after) {
      const res = await request(key, `sync?after=${String(after)}`);
      return (await res.json()) as { records: WireRecord[]; cursor: number; more: boolean };
    },
    async push(records) {
      await request(key, 'sync', { method: 'PUT', body: JSON.stringify({ records }) });
    },
  };
}

/** Записи, только что пришедшие с сервера, — обратно их не отправляем. */
const echo = new Map<string, number>();
let applying = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Один проход синхронизации. Если уже идёт — запомнит и повторит сразу после. */
export async function syncNow(): Promise<void> {
  if (useSync.getState().running) {
    again = true;
    return;
  }
  const state = (await loadState()) ?? null;
  if (!state) return;
  useSync.setState({ running: true });
  applying = true;
  try {
    let next: SyncState;
    try {
      next = (await syncOnce(db, state, httpTransport(state.key), echo)).state;
    } catch (e) {
      next = { ...state, lastError: e instanceof Error ? e.message : String(e) };
    }
    // Пока шёл проход, синхронизацию могли отключить или переключить на другой ключ
    const cur = await metaRepo.get<SyncState | null>(META_KEY);
    if (cur?.key === state.key) await saveState(next);
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

/** Включить синхронизацию. Без key создаётся новый ключ (первое устройство). */
export async function enableSync(key?: string): Promise<string> {
  const k = key ?? generateKey();
  await saveState({ key: k, cursor: 0, pushedSince: 0 });
  void syncNow();
  return k;
}

/** Отключить на этом устройстве; данные остаются и здесь, и на сервере. */
export async function disableSync(): Promise<void> {
  clearTimeout(timer);
  await saveState(null);
}

/** Стереть всё, что лежит на сервере по этому ключу, и отключиться. Данные на устройстве остаются. */
export async function deleteRemoteAndDisable(): Promise<void> {
  const state = await loadState();
  if (!state) return;
  await request(state.key, 'sync', { method: 'DELETE' });
  await disableSync();
}

/** После импорта файла: отправить на сервер вообще всё, даже записи со старой датой. */
export async function markEverythingDirty(): Promise<void> {
  const state = await loadState();
  if (!state) return;
  await saveState({ ...state, pushedSince: 0 });
  schedule(500);
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
  const onVisible = () => {
    if (document.visibilityState === 'visible') schedule(300);
  };
  const onOnline = () => schedule(300);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  unsubs.push(() => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
  });
  const poll = setInterval(() => {
    if (document.visibilityState === 'visible' && useSync.getState().state) void syncNow();
  }, POLL_MS);
  unsubs.push(() => clearInterval(poll));
  void loadState().then((s) => {
    if (s) schedule(500);
  });
  return () => {
    clearTimeout(timer);
    for (const u of unsubs) u();
  };
}
