/* Сессия входа в аккаунт: хранится на устройстве (IndexedDB, таблица meta), её читает и service worker. */
import { db } from '../data/db';
import { metaRepo } from '../data/repo';

export interface Session {
  token: string;
  user: { id: string; email: string };
}

const KEY = 'session';
const listeners = new Set<(s: Session | null) => void>();

export const loadSession = async (): Promise<Session | null> => (await metaRepo.get<Session>(KEY)) ?? null;

export async function saveSession(s: Session): Promise<void> {
  await metaRepo.set(KEY, s);
  for (const l of listeners) l(s);
}

export async function clearSession(): Promise<void> {
  await db.meta.delete(KEY);
  for (const l of listeners) l(null);
}

/** Подписка на вход и выход (в том числе когда сервер отозвал сессию). Возвращает отписку. */
export function onSessionChange(l: (s: Session | null) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Заголовок авторизации для запросов к серверу; пустой, если не вошли. */
export async function authHeaders(): Promise<Record<string, string>> {
  const s = await loadSession();
  return s ? { authorization: `Bearer ${s.token}` } : {};
}
