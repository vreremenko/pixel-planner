/*
 * PIXEL PLANNER — сервер для своего сервера (Node.js): та же логика, что у Cloudflare Worker (server/src/index.ts),
 * но без привязки к платформе: запрос и хранилище приходят снаружи, поэтому её можно проверять тестами
 * (хранилище в памяти — memory-store.ts, боевое — sqlite-store.ts на SQLite).
 */
import { randomUUID } from 'node:crypto';
import { buildPushPayload, type PushSubscription } from '@block65/webcrypto-web-push';
import { PASSWORD_MAX, RateLimiter, TOKEN_RE, hashPassword, isValidEmail, isValidPassword, newToken, normalizeEmail, tokenHash, verifyPassword } from './auth.ts';
import type { DueRow, HttpReq, HttpRes, ScheduleItem, Store, SyncIn } from './types.ts';

export interface Env {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  /** Через запятую: откуда разрешены запросы (фронтенд на GitHub Pages). */
  ALLOWED_ORIGINS?: string;
}

export interface Deps {
  store: Store;
  env: Env;
  now?: () => number;
  /** Ограничитель попыток входа и регистраций; в тестах подменяется, чтобы они не влияли друг на друга. */
  limiter?: RateLimiter;
  /** Отправка push; в тестах подменяется. */
  send?: (env: Env, to: { endpoint: string; p256dh: string; auth: string }, data: unknown) => Promise<{ status: number; detail: string }>;
}

const MAX_ITEMS = 500;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_SYNC_BODY_BYTES = 900 * 1024;
const MAX_SYNC_RECORDS = 300;
/** За один запрос отдаём не больше 300 записей и ~500 КБ; остальное клиент заберёт следующим запросом (`more`). */
const MAX_SYNC_PULL = 300;
const MAX_SYNC_PULL_BYTES = 500_000;
const STALE_MS = 6 * 3_600_000;
const SYNC_TABLES = new Set(['tasks', 'series', 'overrides', 'habits', 'habitLogs', 'xp', 'achievements']);
/** Сессия живёт, пока ею пользуются: не заходили больше года — нужно войти заново. */
const SESSION_MAX_IDLE_MS = 365 * 86_400_000;
const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_MAX_PER_EMAIL = 8;
const LOGIN_MAX_PER_IP = 40;
const REGISTER_WINDOW_MS = 3_600_000;
const REGISTER_MAX_PER_IP = 10;
const KINDS = new Set(['task', 'occurrence', 'habit', 'summary']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const defaultLimiter = new RateLimiter();
/** Хеш заведомо не существующего пароля: нужен, чтобы проверка занимала одинаковое время для любой почты. */
const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + 'AA'.repeat(63) + 'A==';

const json = (data: unknown, status = 200): HttpRes => ({ status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null);

function readJson(body: string, limit = MAX_BODY_BYTES): unknown {
  if (body.length > limit) throw new HttpError(413, 'too large');
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new HttpError(400, 'bad json');
  }
}

function parseItem(x: unknown): ScheduleItem | null {
  if (typeof x !== 'object' || x === null) return null;
  const o = x as Record<string, unknown>;
  const key = str(o.key, 200);
  const title = str(o.title, 200);
  const body = typeof o.body === 'string' ? o.body.slice(0, 500) : '';
  const kind = str(o.kind, 20);
  const fireAt = typeof o.fireAt === 'number' && Number.isFinite(o.fireAt) ? Math.floor(o.fireAt) : null;
  const ref = typeof o.ref === 'string' ? o.ref.slice(0, 200) : '';
  const date = typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : '';
  if (!key || !title || !kind || !KINDS.has(kind) || fireAt === null) return null;
  return { key, title, body, kind, fireAt, ref, date };
}

function parseSyncRecord(x: unknown): SyncIn | null {
  if (typeof x !== 'object' || x === null) return null;
  const o = x as Record<string, unknown>;
  if (typeof o.t !== 'string' || !SYNC_TABLES.has(o.t)) return null;
  if (typeof o.id !== 'string' || o.id.length === 0 || o.id.length > 200) return null;
  if (typeof o.u !== 'number' || !Number.isFinite(o.u)) return null;
  if (typeof o.d !== 'string' || o.d.length > 20_000) return null;
  return { t: o.t, id: o.id, u: Math.floor(o.u), d: o.d };
}

/** Пользователь по токену сессии из заголовка Authorization: Bearer <токен>. */
async function requireUser(req: HttpReq, d: Deps): Promise<{ userId: string; token: string }> {
  const token = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1];
  if (!token || !TOKEN_RE.test(token)) throw new HttpError(401, 'unauthorized');
  const userId = await d.store.sessionUser(tokenHash(token), (d.now ?? Date.now)(), SESSION_MAX_IDLE_MS);
  if (!userId) throw new HttpError(401, 'unauthorized');
  return { userId, token };
}

async function handleSync(req: HttpReq, d: Deps): Promise<HttpRes> {
  const { userId: space } = await requireUser(req, d);
  if (req.method === 'GET') {
    const after = Math.max(0, Number(req.query.after ?? 0) || 0);
    const rows = await d.store.syncPull(space, after, MAX_SYNC_PULL + 1);
    const records: typeof rows = [];
    let bytes = 0;
    for (const r of rows.slice(0, MAX_SYNC_PULL)) {
      if (records.length > 0 && bytes + r.d.length > MAX_SYNC_PULL_BYTES) break;
      records.push(r);
      bytes += r.d.length;
    }
    return json({ records, cursor: records.at(-1)?.seq ?? after, more: records.length < rows.length });
  }
  if (req.method === 'PUT') {
    const b = readJson(req.body, MAX_SYNC_BODY_BYTES) as { records?: unknown[] };
    if (!Array.isArray(b.records)) throw new HttpError(400, 'records required');
    const records = b.records.slice(0, MAX_SYNC_RECORDS).map(parseSyncRecord).filter((x): x is SyncIn => x !== null);
    if (records.length > 0) await d.store.syncPush(space, records);
    return json({ ok: true, count: records.length });
  }
  if (req.method === 'DELETE') {
    await d.store.syncDelete(space);
    return json({ ok: true });
  }
  throw new HttpError(405, 'method not allowed');
}

async function sendOne(env: Env, to: { endpoint: string; p256dh: string; auth: string }, data: unknown): Promise<{ status: number; detail: string }> {
  const vapid = { subject: env.VAPID_SUBJECT ?? '', publicKey: env.VAPID_PUBLIC_KEY ?? '', privateKey: env.VAPID_PRIVATE_KEY ?? '' };
  const subscription: PushSubscription = { endpoint: to.endpoint, expirationTime: null, keys: { p256dh: to.p256dh, auth: to.auth } };
  const payload = await buildPushPayload({ data: JSON.stringify(data), options: { ttl: 3600, urgency: 'high' } }, subscription, vapid);
  const res = await fetch(to.endpoint, payload);
  const detail = res.ok ? '' : (await res.text()).slice(0, 300);
  if (!res.ok) console.warn('push failed', res.status, new URL(to.endpoint).host, detail);
  return { status: res.status, detail };
}


const bad = (status: number, error: string) => new HttpError(status, error);

const publicUser = (u: { id: string; email: string }) => ({ id: u.id, email: u.email });

/** Выдать устройству новую сессию. */
async function openSession(d: Deps, userId: string, device: string): Promise<string> {
  const token = newToken();
  await d.store.sessionCreate({ tokenHash: tokenHash(token), userId, device: device.slice(0, 80), now: (d.now ?? Date.now)() });
  return token;
}

async function handleAuth(req: HttpReq, d: Deps, parts: string[]): Promise<HttpRes> {
  const action = parts[1];
  const now = (d.now ?? Date.now)();
  const limiter = d.limiter ?? defaultLimiter;
  const ip = req.ip ?? 'unknown';

  // POST /api/auth/register {email, password}
  if (action === 'register' && req.method === 'POST') {
    const b = readJson(req.body) as { email?: unknown; password?: unknown; device?: unknown };
    const email = typeof b.email === 'string' ? normalizeEmail(b.email) : '';
    const password = typeof b.password === 'string' ? b.password : '';
    if (limiter.count(`reg:${ip}`, REGISTER_WINDOW_MS, now) >= REGISTER_MAX_PER_IP) throw bad(429, 'too_many_attempts');
    if (!isValidEmail(email)) throw bad(400, 'invalid_email');
    if (!isValidPassword(password)) throw bad(400, 'weak_password');
    limiter.add(`reg:${ip}`, now);
    const id = randomUUID();
    if (!(await d.store.userCreate({ id, email, passHash: await hashPassword(password), now }))) throw bad(409, 'email_taken');
    const token = await openSession(d, id, typeof b.device === 'string' ? b.device : '');
    return json({ token, user: { id, email } }, 201);
  }

  // POST /api/auth/login {email, password}
  if (action === 'login' && req.method === 'POST') {
    const b = readJson(req.body) as { email?: unknown; password?: unknown; device?: unknown };
    const email = typeof b.email === 'string' ? normalizeEmail(b.email) : '';
    const password = typeof b.password === 'string' ? b.password.slice(0, PASSWORD_MAX) : '';
    const keyEmail = `login:e:${email}`;
    const keyIp = `login:i:${ip}`;
    if (limiter.count(keyEmail, LOGIN_WINDOW_MS, now) >= LOGIN_MAX_PER_EMAIL || limiter.count(keyIp, LOGIN_WINDOW_MS, now) >= LOGIN_MAX_PER_IP) {
      throw bad(429, 'too_many_attempts');
    }
    const user = await d.store.userByEmail(email);
    // Пароль проверяем и когда почты нет (по заготовленному хешу), чтобы по времени ответа нельзя было узнать, есть ли такая почта
    const ok = user ? await verifyPassword(password, user.passHash) : (await verifyPassword(password, DUMMY_HASH), false);
    if (!user || !ok) {
      limiter.add(keyEmail, now);
      limiter.add(keyIp, now);
      throw bad(401, 'bad_credentials');
    }
    limiter.reset(keyEmail);
    const token = await openSession(d, user.id, typeof b.device === 'string' ? b.device : '');
    return json({ token, user: publicUser(user) });
  }

  // Остальное — только для вошедшего пользователя
  const { userId, token } = await requireUser(req, d);

  // GET /api/auth/me
  if (action === 'me' && req.method === 'GET') {
    const user = await d.store.userById(userId);
    if (!user) throw bad(401, 'unauthorized');
    return json({ user: publicUser(user) });
  }

  // POST /api/auth/logout
  if (action === 'logout' && req.method === 'POST') {
    await d.store.sessionDelete(tokenHash(token));
    return json({ ok: true });
  }

  // POST /api/auth/password {oldPassword, newPassword}: заодно выходит со всех остальных устройств
  if (action === 'password' && req.method === 'POST') {
    const b = readJson(req.body) as { oldPassword?: unknown; newPassword?: unknown };
    const user = await d.store.userById(userId);
    if (!user) throw bad(401, 'unauthorized');
    if (typeof b.oldPassword !== 'string' || !(await verifyPassword(b.oldPassword.slice(0, PASSWORD_MAX), user.passHash))) throw bad(401, 'bad_credentials');
    if (typeof b.newPassword !== 'string' || !isValidPassword(b.newPassword)) throw bad(400, 'weak_password');
    await d.store.userSetPassword(userId, await hashPassword(b.newPassword));
    await d.store.sessionsDeleteOthers(userId, tokenHash(token));
    return json({ ok: true });
  }

  // DELETE /api/auth/account {password}: стирает аккаунт и все данные
  if (action === 'account' && req.method === 'DELETE') {
    const b = readJson(req.body) as { password?: unknown };
    const user = await d.store.userById(userId);
    if (!user) throw bad(401, 'unauthorized');
    if (typeof b.password !== 'string' || !(await verifyPassword(b.password.slice(0, PASSWORD_MAX), user.passHash))) throw bad(401, 'bad_credentials');
    await d.store.userDelete(userId);
    return json({ ok: true });
  }

  throw bad(404, 'not found');
}

async function handleApi(req: HttpReq, d: Deps): Promise<HttpRes> {
  const parts = req.path.split('/').filter(Boolean);
  const now = (d.now ?? Date.now)();
  const send = d.send ?? sendOne;

  if (req.method === 'GET' && parts[0] === 'config') {
    return json({ vapidPublicKey: d.env.VAPID_PUBLIC_KEY, push: Boolean(d.env.VAPID_PUBLIC_KEY && d.env.VAPID_PRIVATE_KEY) });
  }
  if (parts[0] === 'auth') return handleAuth(req, d, parts);
  if (parts[0] === 'sync' && parts.length === 1) return handleSync(req, d);

  if (parts[0] !== 'devices') throw new HttpError(404, 'not found');
  const { userId } = await requireUser(req, d);
  const id = parts[1];
  if (!id || !UUID.test(id)) throw new HttpError(400, 'bad device id');
  // Устройство чужого пользователя не видно и не меняется
  const owner = await d.store.deviceOwner(id);
  if (owner !== null && owner !== userId) throw new HttpError(404, 'unknown device');

  if (parts.length === 2 && req.method === 'PUT') {
    const b = readJson(req.body) as { subscription?: PushSubscription };
    const sub = b.subscription;
    const endpoint = str(sub?.endpoint, 1000);
    const p256dh = str(sub?.keys.p256dh, 200);
    const auth = str(sub?.keys.auth, 100);
    if (!endpoint?.startsWith('https://') || !p256dh || !auth) throw new HttpError(400, 'bad subscription');
    await d.store.deviceUpsert({ id, userId, endpoint, p256dh, auth, now });
    return json({ ok: true });
  }
  if (parts.length === 2 && req.method === 'DELETE') {
    await d.store.deviceDelete(id);
    return json({ ok: true });
  }

  if (owner === null) throw new HttpError(404, 'unknown device');

  if (parts[2] === 'schedule' && req.method === 'PUT') {
    const b = readJson(req.body) as { items?: unknown[] };
    if (!Array.isArray(b.items)) throw new HttpError(400, 'items required');
    const items = b.items.slice(0, MAX_ITEMS).map(parseItem).filter((x): x is ScheduleItem => x !== null);
    await d.store.scheduleReplace(id, items, now);
    return json({ ok: true, count: items.length });
  }
  if (parts[2] === 'test' && req.method === 'POST') {
    const dev = await d.store.deviceGet(id);
    if (!dev) throw new HttpError(404, 'unknown device');
    const r = await send(d.env, dev, { key: `test:${String(now)}`, kind: 'summary', ref: '', date: '', title: 'PIXEL PLANNER', body: 'Push работает! ★', fireAt: now });
    return json({ ok: r.status < 300, status: r.status, detail: r.detail, service: new URL(dev.endpoint).host });
  }
  if (parts[2] === 'snooze' && req.method === 'POST') {
    const it = parseItem(readJson(req.body));
    if (!it) throw new HttpError(400, 'bad item');
    await d.store.reminderSnooze(id, { ...it, key: `${it.key}#snooze${String(it.fireAt)}` });
    return json({ ok: true });
  }
  throw new HttpError(404, 'not found');
}

function corsHeaders(req: HttpReq, env: Env): Record<string, string> {
  const origin = req.headers.origin;
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

/** Точка входа HTTP: запрос → ответ, с CORS и обработкой ошибок. */
export async function handle(req: HttpReq, d: Deps): Promise<HttpRes> {
  const cors = corsHeaders(req, d.env);
  if (req.method === 'OPTIONS') return { status: 204, headers: cors, body: '' };
  try {
    const res = await handleApi(req, d);
    return { ...res, headers: { ...res.headers, ...cors } };
  } catch (e) {
    if (e instanceof HttpError) return { ...json({ error: e.message }, e.status), headers: { 'content-type': 'application/json', ...cors } };
    console.error(e);
    return { ...json({ error: 'internal' }, 500), headers: { 'content-type': 'application/json', ...cors } };
  }
}

/** Рассылка наступивших напоминаний (запускается таймером раз в минуту). */
export async function sendDue(d: Deps): Promise<number> {
  const now = (d.now ?? Date.now)();
  const send = d.send ?? sendOne;
  const due: DueRow[] = await d.store.dueReminders(now, 200);
  const gone = new Set<string>();
  const retry = new Set<string>();
  let sent = 0;
  await Promise.all(
    due.map(async (r) => {
      if (now - r.fireAt > STALE_MS || gone.has(r.deviceId)) return;
      const data = { key: r.key.split('#snooze')[0], kind: r.kind, ref: r.ref, date: r.date, title: r.title, body: r.body, fireAt: r.fireAt };
      try {
        const { status } = await send(d.env, r, data);
        if (status === 404 || status === 410) gone.add(r.deviceId);
        else if (status < 300) sent++;
        else if (status === 429 || status >= 500) retry.add(`${r.deviceId}|${r.key}`);
      } catch (e) {
        console.warn('push error', e);
        retry.add(`${r.deviceId}|${r.key}`);
      }
    }),
  );
  const done = due.filter((r) => !retry.has(`${r.deviceId}|${r.key}`) || now - r.fireAt > STALE_MS).map((r) => ({ deviceId: r.deviceId, key: r.key }));
  if (done.length > 0) await d.store.markSent(done);
  for (const id of gone) await d.store.deviceDelete(id);
  return sent;
}
