import { expect } from 'vitest';
import { RateLimiter } from './auth.ts';
import { handle, type Deps } from './core.ts';
import { MemoryStore } from './memory-store.ts';
import type { HttpReq, Store } from './types.ts';

const PASSWORD = 'correct horse battery';

export const mk = (over: Partial<Deps> = {}, store: Store = new MemoryStore()): Deps => ({
  store,
  env: { ALLOWED_ORIGINS: 'https://site.test', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' },
  now: () => 1_000_000,
  limiter: new RateLimiter(),
  ...over,
});

export const req = (method: string, path: string, o: { token?: string; body?: unknown; query?: Record<string, string>; origin?: string; ip?: string } = {}): HttpReq => ({
  method,
  path,
  query: o.query ?? {},
  headers: { ...(o.token ? { authorization: `Bearer ${o.token}` } : {}), ...(o.origin ? { origin: o.origin } : {}) },
  body: o.body === undefined ? '' : JSON.stringify(o.body),
  ...(o.ip ? { ip: o.ip } : {}),
});

export const json = (res: { body: string }): Record<string, unknown> => JSON.parse(res.body) as Record<string, unknown>;

/** Зарегистрировать пользователя и вернуть токен его сессии. */
export async function register(d: Deps, email: string, password = PASSWORD): Promise<string> {
  const res = await handle(req('POST', 'auth/register', { body: { email, password } }), d);
  expect(res.status).toBe(201);
  return json(res).token as string;
}
